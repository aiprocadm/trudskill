import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { DOCUMENTS_PERSISTENCE_BACKEND } from './infrastructure/documents-persistence.token.js';
import { type PublicVerifyResult, buildPublicVerifyResult } from './public-verify.util.js';
import { AuditService } from '../audit/audit.service.js';
import { resolveTenantDisplayName } from '../tenant/tenant-branding.js';
import { TenantService } from '../tenant/tenant.service.js';

import type { DocumentsPersistenceBackend } from './infrastructure/documents-persistence.backend.js';

/**
 * Pillar A Plan C §5.8 — публичная проверка подлинности документа по QR-коду.
 *
 * Endpoint без TenantGuard / PermissionGuard / auth — любой пользователь
 * (или regulator) может проверить документ через ссылку из QR.
 *
 * Документ ищется КРОСС-TENANT по `qrToken` напрямую в durable-хранилище: у
 * публичного пути нет ни tenant-контекста, ни request-scoped state, поэтому он НЕ
 * может полагаться на per-tenant загрузку (`MvpRequestPersistenceInterceptor`-аналог
 * к нему не применяется). Раньше контроллер читал пустой request-scoped state →
 * любой реальный QR давал `not_found`.
 *
 * Rate-limit: 30 req/мин/IP (ФТ-G2). Защищает от перебора, хотя при 128-битном qr_token
 * перебор практически невозможен. Важно: `@Throttle` без `@UseGuards(ThrottlerGuard)` НЕ
 * применяется (глобального ThrottlerGuard в app.module нет — лимиты навешиваются по-роутно,
 * как в auth.controller), поэтому guard обязателен, иначе лимит «спит».
 */
@Controller('public')
export class PublicVerifyController {
  constructor(
    @Inject(DOCUMENTS_PERSISTENCE_BACKEND)
    private readonly persistence: DocumentsPersistenceBackend,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantService) private readonly tenantService: TenantService
  ) {}

  @Get('verify/:token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verify(@Param('token') token: string): Promise<PublicVerifyResult> {
    // Дешёвый guard до запроса в хранилище: 128-битный base64url-токен ≈ 22 символа.
    const found =
      token && token.length >= 8
        ? await this.persistence.findGeneratedDocumentByQrToken(token)
        : null;

    /*
     * Запись в журнал идёт ПОСЛЕ поиска и от имени центра, ВЫДАВШЕГО документ.
     *
     * Прежде она шла первой строкой и с `tenantId: 'public'` — центра с таким кодом не
     * существует, а у журнала внешний ключ на список центров. Из-за этого КАЖДАЯ публичная
     * проверка падала пятисоткой: проверяющий, сканировавший QR на удостоверении, видел
     * ошибку сервера вместо ответа. В тестах это не всплывало — там журнал пишется в память,
     * без базы и без внешних ключей.
     *
     * Заодно запись стала полезнее: центр видит в своём журнале, что его документ проверяли.
     * Полный код в журнал не кладётся — он равносилен доступу к документу; хватает первых
     * четырёх символов, чтобы связать обращения в расследовании.
     */
    if (!found) {
      /*
       * Неизвестный код приписать некому: центра у него нет. В базу такую попытку не пишем
       * (внешний ключ), она остаётся в оперативной записи журнала; от перебора кодов защищает
       * ограничение частоты — тридцать обращений в минуту.
       */
      await this.auditService.writeCritical(
        {
          tenantId: 'public',
          action: 'documents.qr_verification_failed',
          entityType: 'documents.generated',
          entityId: `${token.slice(0, 4)}…`
        },
        { skipDatabase: true }
      );
      throw new NotFoundException({
        code: 'document_not_found',
        message: 'Документ с таким QR-кодом не найден'
      });
    }

    await this.auditService.writeCritical({
      tenantId: found.document.tenantId,
      action: 'documents.qr_verification_requested',
      entityType: 'documents.generated',
      entityId: `${token.slice(0, 4)}…`
    });
    const result = buildPublicVerifyResult(found.document);
    // ФТ-D3.1: подпись выдавшего центра. Изъятый документ (not_found) центра не называет —
    // «тихое» архивирование не должно подтверждать сам факт связи с центром.
    if (result.status !== 'not_found') {
      try {
        const [tenant, branding] = await Promise.all([
          this.tenantService.getTenantById(found.document.tenantId),
          this.tenantService.getBranding(found.document.tenantId)
        ]);
        result.issuerName = resolveTenantDisplayName(branding, tenant.name);
        if (branding.logoUrl) result.issuerLogoUrl = branding.logoUrl;
        if (branding.brandColor) result.issuerBrandColor = branding.brandColor;
      } catch {
        // Публичная проверка подлинности важнее витрины: сбой чтения бренда
        // не валит ответ, страница просто остаётся без подписи центра.
      }
    }
    return result;
  }
}
