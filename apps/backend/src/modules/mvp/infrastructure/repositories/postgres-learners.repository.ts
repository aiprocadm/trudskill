import { Inject, Injectable } from '@nestjs/common';

import {
  CURRENT_ENROLLMENT_STATUSES,
  type LearnerRegistryDetails,
  type LearnersListQuery
} from './learners-registry.js';
import {
  type LookupItem,
  type RegistryListPage,
  type RegistryListQuery,
  likePattern
} from './registry-list-query.js';
import { snilsBlindIndex } from '../../../../infrastructure/crypto/pii-crypto.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';
import { rowToEntity } from '../../../migration/backfill/normalized/normalized-projection.js';
import { normalizeSnils } from '../../snils.util.js';

import type { LearnersRepository } from './learners.repository.js';
import type { Learner } from '../../mvp.types.js';

/** Белый список сортировок слушателей: ФИО, табельный номер, статус, даты. */
export const LEARNER_SORT_COLUMNS: Record<string, string> = {
  id: 'id',
  lastName: 'last_name',
  firstName: 'first_name',
  middleName: 'middle_name',
  learnerNo: 'learner_no',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

const COLUMNS =
  'id, tenant_id, created_at, updated_at, user_id, learner_no, first_name, last_name, middle_name, ' +
  'position, organization_unit_id, snils_enc, snils_hash, email_enc, phone_enc, birth_date_enc, status, ' +
  'external_id, source_system, legacy_login, linked_iam_user_id, ' +
  /* Личное дело (МГ-C1.1): колонки 0106/0002 читаются вместе с карточкой. */
  'counterparty_id, counterparty_employee_id, passport_enc, passport_hash, gender, birth_place, citizenship, ' +
  'registration_address, education_level, diploma, tracking_number, delivery_method, extra_fields, ' +
  'consent_status, photo_file_id, login, position_id, payload';

/** Выражение ФИО — ровно как в индексе `learners_full_name_trgm_idx` (0109), иначе индекс не сработает. */
const FULL_NAME = "(last_name || ' ' || first_name || ' ' || coalesce(middle_name, ''))";

/** Строка похожа на СНИЛС: только цифры, пробелы и дефисы, а после нормализации — 11 цифр. */
export const looksLikeSnils = (q: string): boolean =>
  /^[\d\s-]+$/.test(q) && normalizeSnils(q).length === 11;

/**
 * Слушатели из `learning.learners` (Фаза 1, срез 2b). ПДн отдаются шифртекстом — расшифровывает
 * `MvpNormalizedReadsService`. Скоуп представителя заказчика здесь не применяется: портал остаётся
 * на снимке до проекции зачислений (РМ37), а у представителя нет права `learners.read`.
 */
@Injectable()
export class PostgresLearnersRepository implements LearnersRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, query: LearnersListQuery): Promise<RegistryListPage<Learner>> {
    const { extra, params } = this.filters(tenantId, query);
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from learning.learners where tenant_id = $1 ${extra}`,
      params
    );
    const sort = query.sort ?? { column: 'created_at', direction: 'asc' as const };
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.learners
        where tenant_id = $1 ${extra}
        order by ${sort.column} ${sort.direction}, id asc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      items: rows.map((row) => rowToEntity('learners', row) as unknown as Learner),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0)
    };
  }

  async get(tenantId: string, id: string): Promise<Learner | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.learners where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? (rowToEntity('learners', rows[0]) as unknown as Learner) : null;
  }

  async lookup(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<LookupItem>> {
    const page = await this.list(tenantId, query);
    return {
      ...page,
      items: page.items.map((item) => ({
        id: item.id,
        label: `${item.firstName} ${item.lastName}`.trim(),
        status: item.status
      }))
    };
  }

  async findBySnils(tenantId: string, snils: string): Promise<Learner[]> {
    const digits = normalizeSnils(snils);
    if (!digits) return [];
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from learning.learners where tenant_id = $1 and snils_hash = $2 order by id asc`,
      [tenantId, snilsBlindIndex(digits)]
    );
    return rows.map((row) => rowToEntity('learners', row) as unknown as Learner);
  }

  async learnerIdsByUser(tenantId: string, userId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `select id from learning.learners where tenant_id = $1 and linked_iam_user_id = $2 order by id asc`,
      [tenantId, userId]
    );
    return rows.map((r) => r.id);
  }

  /** Дополнительные условия к `where tenant_id = $1` (само условие — в тексте запроса, для сторожа). */
  /**
   * МГ-C3.2 (срез 11.1, РМ103): сведения реестра четырьмя запросами по идентификаторам страницы —
   * список остаётся на своих индексах, а соединения идут по маленькому набору `id`.
   */
  async registryDetails(
    tenantId: string,
    learnerIds: readonly string[]
  ): Promise<Map<string, LearnerRegistryDetails>> {
    const result = new Map<string, LearnerRegistryDetails>();
    if (learnerIds.length === 0) return result;
    const ids = Array.from(new Set(learnerIds));
    for (const id of ids) result.set(id, { consentGranted: false });
    const put = (id: string, patch: LearnerRegistryDetails) =>
      result.set(id, { ...(result.get(id) ?? {}), ...patch });

    const companies = await this.db.query<{ id: string; name: string }>(
      `select l.id, c.name from learning.learners l
         join crm.counterparties c on c.tenant_id = l.tenant_id and c.id = l.counterparty_id
        where l.tenant_id = $1 and l.id = any($2::text[])`,
      [tenantId, ids]
    );
    for (const row of companies) put(row.id, { companyName: row.name });

    /* Текущая группа (РМ104): последнее по дате незавершённое зачисление. */
    const groups = await this.db.query<{
      learner_id: string;
      group_id: string;
      name: string;
      status: string;
    }>(
      `select distinct on (e.learner_id) e.learner_id, g.id as group_id, g.name, g.status
         from learning.enrollments e
         join learning.groups g on g.tenant_id = e.tenant_id and g.id = e.group_id
        where e.tenant_id = $1 and e.learner_id = any($2::text[]) and e.status = any($3::text[])
        order by e.learner_id, e.enrolled_at desc, e.id desc`,
      [tenantId, ids, [...CURRENT_ENROLLMENT_STATUSES]]
    );
    for (const row of groups) {
      put(row.learner_id, {
        currentGroupId: row.group_id,
        currentGroupName: row.name,
        currentGroupStatus: row.status
      });
    }

    /* Последний вход — из сессий, как в журнале часов (РМ66): колонка `last_login_at` никем не пишется. */
    const logins = await this.db.query<{ id: string; last_login_at: Date | string }>(
      `select l.id, max(s.created_at) as last_login_at
         from learning.learners l
         join iam.sessions s on s.tenant_id = l.tenant_id and s.user_id = l.linked_iam_user_id
        where l.tenant_id = $1 and l.id = any($2::text[])
        group by l.id`,
      [tenantId, ids]
    );
    for (const row of logins) {
      const at =
        row.last_login_at instanceof Date
          ? row.last_login_at.toISOString()
          : String(row.last_login_at);
      put(row.id, { lastLoginAt: at });
    }

    /* Согласие ПДн: последний факт `personal_data`, действует, пока не отозван. */
    const consents = await this.db.query<{ learner_id: string; revoked_at: Date | string | null }>(
      `select distinct on (learner_id) learner_id, revoked_at
         from learning.consent_facts
        where tenant_id = $1 and learner_id = any($2::text[]) and kind = 'personal_data'
        order by learner_id, granted_at desc`,
      [tenantId, ids]
    );
    for (const row of consents) put(row.learner_id, { consentGranted: row.revoked_at === null });
    return result;
  }

  private filters(
    tenantId: string,
    query: LearnersListQuery
  ): { extra: string; params: unknown[] } {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    if (query.counterpartyId) {
      // Скоуп представителя заказчика (ФТ-E5) — как в снимке: слушатели, зачисленные в группы
      // его контрагента, любой статус зачисления; группа без контрагента не считается.
      params.push(query.counterpartyId);
      conditions.push(
        `exists (select 1 from learning.enrollments e join learning.groups g on g.tenant_id = e.tenant_id and g.id = e.group_id where e.tenant_id = $1 and e.learner_id = learning.learners.id and g.counterparty_id = $${params.length})`
      );
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    /* МГ-C3.2 (срез 11.1): компания, группа, «без почты», «не входил». */
    if (query.companyId) {
      params.push(query.companyId);
      conditions.push(`counterparty_id = $${params.length}`);
    }
    if (query.groupId) {
      params.push(query.groupId);
      const groupParam = `$${params.length}`;
      params.push([...CURRENT_ENROLLMENT_STATUSES]);
      conditions.push(
        `exists (select 1 from learning.enrollments e where e.tenant_id = $1 and e.learner_id = learning.learners.id and e.group_id = ${groupParam} and e.status = any($${params.length}::text[]))`
      );
    }
    if (query.noEmail) conditions.push(`email_enc is null`);
    if (query.neverLoggedIn) {
      conditions.push(
        `(linked_iam_user_id is null or not exists (select 1 from iam.sessions s where s.tenant_id = $1 and s.user_id = learning.learners.linked_iam_user_id))`
      );
    }
    if (query.q) {
      if (looksLikeSnils(query.q)) {
        params.push(snilsBlindIndex(query.q));
        conditions.push(`snils_hash = $${params.length}`);
      } else {
        params.push(likePattern(query.q));
        const p = `$${params.length}`;
        conditions.push(`(${FULL_NAME} ilike ${p} or coalesce(learner_no, '') ilike ${p})`);
      }
    }
    return { extra: conditions.map((c) => `and ${c}`).join(' '), params };
  }
}
