import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';

import { TENANT_BRANDING_KEY, readTenantBranding } from './tenant-branding.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { TenantTimezoneService } from '../../infrastructure/tenant/tenant-timezone.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { TenantBranding } from './tenant-branding.js';
import type {
  Tenant,
  TenantCommission,
  TenantRequisites,
  TenantSettings,
  TenantStatus
} from './tenant.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * ФТ-D2.1 (Фаза 4 Task 2): единственный источник тенантов — БД. In-memory фоллбека
 * `tenant_demo` больше нет: платформа сдаётся в аренду, и «знать» тенанта, которого нет
 * в базе, означало бы подменять арендатора демо-данными при любом сбое конфигурации.
 * Без БД сервис отвечает честной недоступностью, а не выдуманными данными.
 */
@Injectable()
export class TenantService {
  private readonly commissions = new Map<string, TenantCommission>();

  constructor(
    @Inject(TenantScopedRepository) private readonly tenantScopedRepository: TenantScopedRepository,
    @Optional() @Inject(DatabaseService) private readonly databaseService?: DatabaseService,
    /*
     * Аудит — ПОСЛЕДНИМ аргументом и необязательным. Тесты собирают сервис позиционно
     * (`new TenantService(repo, db)`), и вставка в середину списка тихо подменяет им базу:
     * ровно это и случилось при первой попытке — десять тестов покраснели.
     */
    @Optional() @Inject(AuditService) private readonly auditService?: AuditService,
    /* По тому же правилу — последним и необязательным (журнал 300). */
    @Optional()
    @Inject(TenantTimezoneService)
    private readonly tenantTimezones?: TenantTimezoneService
  ) {}

  /** Фейл-клоузед: без БД тенантов НЕ СУЩЕСТВУЕТ — понятная 503, а не демо-подмена. */
  private requireDb(): DatabaseService {
    if (!this.databaseService) {
      throw new ServiceUnavailableException({
        code: 'tenant_store_unavailable',
        message: 'Tenant store (database) is not available'
      });
    }
    return this.databaseService;
  }

  async getTenantById(tenantId: string): Promise<Tenant> {
    const rows = await this.requireDb().query<{
      id: string;
      code: string;
      name: string;
      status: TenantStatus;
    }>('select id, code, name, status from core.tenants where id = $1', [tenantId]);
    const tenant = rows[0];
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }
    return tenant;
  }

  async getSettings(tenantId: string): Promise<TenantSettings> {
    const rows = await this.requireDb().query<{
      tenant_id: string;
      payload: Record<string, unknown>;
    }>('select tenant_id, payload from org.tenant_settings where tenant_id = $1', [tenantId]);
    const settingsRow = rows[0];
    if (!settingsRow) {
      throw new NotFoundException({
        code: 'tenant_settings_not_found',
        message: 'Tenant settings not found'
      });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, settingsRow.tenant_id);
    const payload = settingsRow.payload ?? {};
    return {
      tenantId: settingsRow.tenant_id,
      locale: typeof payload.locale === 'string' ? payload.locale : 'ru-RU',
      timezone: typeof payload.timezone === 'string' ? payload.timezone : 'Europe/Moscow',
      payload
    };
  }

  async getRequisites(tenantId: string): Promise<TenantRequisites> {
    const rows = await this.requireDb().query<{
      tenant_id: string;
      legal_name: string;
      tax_number: string;
      payload: Record<string, unknown>;
    }>(
      'select tenant_id, legal_name, tax_number, payload from org.tenant_requisites where tenant_id = $1',
      [tenantId]
    );

    const requisitesRow = rows[0];
    if (!requisitesRow) {
      throw new NotFoundException({
        code: 'tenant_requisites_not_found',
        message: 'Tenant requisites not found'
      });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, requisitesRow.tenant_id);
    return {
      tenantId: requisitesRow.tenant_id,
      legalName: requisitesRow.legal_name,
      taxNumber: requisitesRow.tax_number,
      payload: requisitesRow.payload ?? {}
    };
  }

  async updateSettings(
    tenantId: string,
    patch: { locale?: string; timezone?: string; payload?: Record<string, unknown> },
    ctx?: RequestContext
  ): Promise<TenantSettings> {
    const db = this.requireDb();
    const current = await this.getSettings(tenantId);
    const next: TenantSettings = {
      tenantId,
      locale: patch.locale ?? current.locale,
      timezone: patch.timezone ?? current.timezone,
      payload: { ...current.payload, ...(patch.payload ?? {}) }
    };
    /*
     * `id` заполняется явно: колонка объявлена `not null` без значения по умолчанию, и без
     * него ПЕРВОЕ сохранение падало ошибкой сервера — центр не мог задать даже часовой пояс.
     * Идентификатор выводится из арендатора (а не случайный), чтобы у центра оставалась
     * ровно одна строка настроек и повторное сохранение обновляло её же.
     * Тот же приём применён ниже, в ветке брендирования.
     */
    await db.query(
      `insert into org.tenant_settings (id, tenant_id, payload)
       values (concat('tenant_settings_', $1::text), $1, $2::jsonb)
       on conflict (tenant_id) do update set payload = excluded.payload, updated_at = now()`,
      [tenantId, JSON.stringify({ ...next.payload, locale: next.locale, timezone: next.timezone })]
    );
    await this.audit('tenant.settings_updated', tenantId, current, next, ctx);
    // Пояс запомнен на минуту — после правки настройки забываем его, чтобы новый
    // подхватился сразу, а не «когда-нибудь в течение минуты» (журнал 300).
    this.tenantTimezones?.forget(tenantId);
    return this.getSettings(tenantId);
  }

  /**
   * ФТ-D3.1: бренд центра. Отсутствие строки настроек — не ошибка, а «бренда нет»:
   * тема по умолчанию должна краситься и у только что созданного арендатора.
   */
  async getBranding(tenantId: string): Promise<TenantBranding> {
    try {
      return readTenantBranding(await this.getSettings(tenantId));
    } catch (err) {
      if (err instanceof NotFoundException) return {};
      throw err;
    }
  }

  /**
   * Частичное обновление: пришедшие поля заменяют текущие (undefined = сброс),
   * не пришедшие — сохраняются. Upsert напрямую, а не через updateSettings:
   * у свежесозданного арендатора строки настроек ещё нет, и updateSettings
   * упал бы NotFound раньше своего же upsert-а.
   */
  async updateBranding(
    tenantId: string,
    patch: Record<string, string | undefined>
  ): Promise<TenantBranding> {
    const current = await this.getBranding(tenantId);
    const next: Record<string, string> = {};
    for (const field of ['displayName', 'logoUrl', 'brandColor', 'accentColor'] as const) {
      const value = field in patch ? patch[field] : current[field];
      if (value !== undefined) next[field] = value;
    }
    // id обязателен (PK без default) — вскрыто живым прогоном: INSERT без id падает
    // not-null constraint; конфликт ловится по unique(tenant_id), поэтому детерминированный
    // id по образцу сида безопасен.
    await this.requireDb().query(
      `insert into org.tenant_settings (id, tenant_id, payload)
       values (concat('tenant_settings_', $1::text), $1, jsonb_build_object('${TENANT_BRANDING_KEY}', $2::jsonb))
       on conflict (tenant_id) do update
         set payload = coalesce(org.tenant_settings.payload, '{}'::jsonb)
           || jsonb_build_object('${TENANT_BRANDING_KEY}', $2::jsonb),
             updated_at = now()`,
      [tenantId, JSON.stringify(next)]
    );
    return this.getBranding(tenantId);
  }

  async updateRequisites(
    tenantId: string,
    patch: { legalName?: string; taxNumber?: string; payload?: Record<string, unknown> },
    ctx?: RequestContext
  ): Promise<TenantRequisites> {
    const db = this.requireDb();
    const current = await this.getRequisites(tenantId);
    const next: TenantRequisites = {
      tenantId,
      legalName: patch.legalName ?? current.legalName,
      taxNumber: patch.taxNumber ?? current.taxNumber,
      payload: { ...current.payload, ...(patch.payload ?? {}) }
    };
    await db.query(
      /*
       * `id` — та же история, что и у настроек: без него первое сохранение реквизитов
       * падало ошибкой сервера. Реквизиты не «просто карточка»: юридическое название, ИНН
       * и ссылки на подпись с печатью попадают в выдаваемые удостоверения.
       */
      `insert into org.tenant_requisites (id, tenant_id, legal_name, tax_number, payload)
       values (concat('tenant_requisites_', $1::text), $1, $2, $3, $4::jsonb)
       on conflict (tenant_id)
       do update set legal_name = excluded.legal_name, tax_number = excluded.tax_number,
                     payload = excluded.payload, updated_at = now()`,
      [tenantId, next.legalName, next.taxNumber, JSON.stringify(next.payload)]
    );
    await this.audit('tenant.requisites_updated', tenantId, current, next, ctx);
    return this.getRequisites(tenantId);
  }

  /*
   * След в журнале действий (ревизия 2026-08-26, ФТ-G1).
   *
   * Правка карточки центра не оставляла следа вообще. А это не «карточка»: отсюда в
   * выдаваемое удостоверение попадают юридическое название, ИНН и картинки подписи с
   * печатью. Подмену такого рода потом не с чем сопоставить — журнал молчал о том, кто и
   * когда её сделал.
   *
   * `writeCritical` (а не `write`): запись ждётся, как у лицензий и входа. Потерять след
   * изменения документа с юридической силой хуже, чем задержать ответ на миллисекунды.
   * Аудит опционален в конструкторе — тесты поднимают сервис без него, и молчаливое
   * отсутствие здесь допустимо: это не путь пользователя, а сборка.
   */
  private async audit(
    action: string,
    tenantId: string,
    oldValues: unknown,
    newValues: unknown,
    ctx?: RequestContext
  ) {
    if (!this.auditService) return;
    await this.auditService.writeCritical({
      tenantId,
      ...(ctx?.userId ? { actorId: ctx.userId } : {}),
      action,
      entityType: 'tenant',
      entityId: tenantId,
      oldValues: (oldValues as Record<string, unknown>) ?? {},
      newValues: (newValues as Record<string, unknown>) ?? {},
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx?.ip ? { ip: ctx.ip } : {}),
      ...(ctx?.userAgent ? { userAgent: ctx.userAgent } : {})
    });
  }

  /**
   * Тенанты, у которых обучение идёт, — для ночных кросс-тенантных сканов (Plan 5B-2).
   * `trial` включён: пробный центр реально учится и должен получать напоминания;
   * `suspended`/`archived` исключены — неоплата и офбординг останавливают рассылки.
   */
  async listActiveTenantIds(): Promise<string[]> {
    const rows = await this.requireDb().query<{ id: string }>(
      "select id from core.tenants where status in ('trial', 'active') order by id"
    );
    return rows.map((r) => r.id);
  }

  async getCommission(tenantId: string): Promise<TenantCommission> {
    this.requireDb();
    const cached = this.commissions.get(tenantId);
    if (cached) {
      this.tenantScopedRepository.enforceTenantScope(tenantId, cached.tenantId);
      return cached;
    }
    // Демо-состава «Иванов/Петров» больше нет: пустая комиссия — честное состояние
    // нового центра, состав заводится мастером онбординга (ФТ-D2.3).
    const empty: TenantCommission = { tenantId, members: [] };
    this.commissions.set(tenantId, empty);
    return empty;
  }
}
