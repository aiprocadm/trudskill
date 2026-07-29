import { BadRequestException, Inject, Injectable } from '@nestjs/common';

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
    @Inject(IDENTITY_POLICY_REPOSITORY) private readonly repo: IdentityPolicyRepository
  ) {}

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
    }
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
    return this.repo.save(tenantId, {
      scope: input.scope,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      level: normalizeLevel(input.level),
      requirePhotoBeforeExam: input.requirePhotoBeforeExam === true
    });
  }

  remove(tenantId: string, scope: IdentityPolicyScope, scopeId?: string): Promise<boolean> {
    return this.repo.remove(tenantId, scope, scopeId);
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
