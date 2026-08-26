import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';

import {
  type EffectiveIdentityPolicy,
  type IdentityPolicyScope,
  normalizeLevel,
  resolveIdentityPolicy
} from './identity-policy.js';
import {
  IDENTITY_POLICY_REPOSITORY,
  type IdentityPolicyRepository,
  type IdentityPolicyRow
} from './identity-policy.repository.js';
import { AuditService } from '../../audit/audit.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Хранение и вычисление политики идентификации (ФТ-C1, Фаза 3 Task 1).
 *
 * Сервис намеренно тонкий: всё решение живёт в чистой `resolveIdentityPolicy`,
 * здесь только доступ к данным и проверка входа. Логика допуска к экзамену не должна
 * прятаться за обращениями к БД — иначе её не проверить тестом.
 */
@Injectable()
export class IdentityPolicyService {
  constructor(
    @Inject(IDENTITY_POLICY_REPOSITORY) private readonly repo: IdentityPolicyRepository,
    /* Последним и необязательным: сервисы собираются в тестах позиционно (см. §5.357). */
    @Optional() @Inject(AuditService) private readonly auditService?: AuditService
  ) {}

  /*
   * След в журнале действий (ревизия 2026-08-26, ФТ-G1).
   *
   * Политика решает, кого пускать к экзамену и нужно ли перед ним фото. Ослабление уровня —
   * это ослабление доказательства того, что экзамен сдавал именно тот человек, и делается
   * оно одним запросом. Следа не оставалось никакого.
   */
  private auditPolicy(
    tenantId: string,
    action: string,
    scope: string,
    scopeId: string | undefined,
    newValues: Record<string, unknown>,
    ctx?: RequestContext
  ) {
    this.auditService?.write({
      tenantId,
      ...(ctx?.userId ? { actorId: ctx.userId } : {}),
      action,
      entityType: 'identity_policy',
      entityId: scopeId ? `${scope}:${scopeId}` : scope,
      newValues,
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx?.ip ? { ip: ctx.ip } : {}),
      ...(ctx?.userAgent ? { userAgent: ctx.userAgent } : {})
    });
  }

  list(tenantId: string): Promise<IdentityPolicyRow[]> {
    return this.repo.list(tenantId);
  }

  async save(
    tenantId: string,
    input: {
      scope: IdentityPolicyScope;
      scopeId?: string;
      level: number;
      requirePhotoBeforeExam?: boolean;
    },
    ctx?: RequestContext
  ): Promise<IdentityPolicyRow> {
    if (input.scope === 'tenant' && input.scopeId) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'У политики тенанта не может быть привязки к объекту'
      });
    }
    if (input.scope !== 'tenant' && !input.scopeId) {
      // Политика направления без направления ни к чему не применима — молча сохранять
      // такую запись значит завести настройку-призрак.
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Для политики направления или курса нужен идентификатор объекта'
      });
    }
    const saved = await this.repo.save(tenantId, {
      scope: input.scope,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      level: normalizeLevel(input.level),
      requirePhotoBeforeExam: input.requirePhotoBeforeExam === true
    });
    this.auditPolicy(
      tenantId,
      'identity.policy_saved',
      input.scope,
      input.scopeId,
      {
        level: saved.level,
        requirePhotoBeforeExam: saved.requirePhotoBeforeExam
      },
      ctx
    );
    return saved;
  }

  async remove(
    tenantId: string,
    scope: IdentityPolicyScope,
    scopeId?: string,
    ctx?: RequestContext
  ): Promise<boolean> {
    const removed = await this.repo.remove(tenantId, scope, scopeId);
    if (removed) this.auditPolicy(tenantId, 'identity.policy_removed', scope, scopeId, {}, ctx);
    return removed;
  }

  /**
   * Действующая политика для курса. Гейты (Task 2) будут звать именно её.
   * `directionId` не всегда известен — тогда в расчёт идут тенант и курс.
   */
  async effectiveForCourse(
    tenantId: string,
    courseId?: string,
    directionId?: string
  ): Promise<EffectiveIdentityPolicy> {
    const rows = await this.repo.list(tenantId);
    return resolveIdentityPolicy([
      rows.find((row) => row.scope === 'course' && row.scopeId === courseId),
      rows.find((row) => row.scope === 'direction' && row.scopeId === directionId),
      rows.find((row) => row.scope === 'tenant')
    ]);
  }
}
