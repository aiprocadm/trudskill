import { CURRENT_ENROLLMENT_STATUSES } from './learners-registry.js';
import { looksLikeSnils } from './postgres-learners.repository.js';
import { snilsBlindIndex } from '../../../../infrastructure/crypto/pii-crypto.js';
import { normalizeSnils } from '../../snils.util.js';

import type { LearnerRegistryDetails, LearnersListQuery } from './learners-registry.js';
import type { LearnersRepository } from './learners.repository.js';
import type { LookupItem, RegistryListPage, RegistryListQuery } from './registry-list-query.js';
import type { Learner } from '../../mvp.types.js';

/**
 * Репозиторий слушателей поверх массива — для тестов и режима `ALLOW_IN_MEMORY_STATE`.
 * Повторяет семантику SQL-репозитория: поиск по ФИО и табельному номеру, точный СНИЛС в любом
 * написании, сортировка по белому списку с добивкой по `id`. Строки могут лежать как открытыми,
 * так и «как в таблице» — шифртекстом со слепым индексом `snilsHash`: тогда СНИЛС сравнивается
 * по индексу, как в SQL. `decryptLearnerPiiAtRest` в сервисе чтения пропускает открытые значения.
 */
/** Сведения реестра для режима без базы (тесты): зачисления, компании, входы, согласия — по образцу SQL. */
export interface InMemoryRegistrySeeds {
  groupsByLearner?: Map<
    string,
    Array<{
      groupId: string;
      groupName: string;
      groupStatus: string;
      status: string;
      enrolledAt: string;
    }>
  >;
  companyNames?: Map<string, string>;
  /** Последний вход по идентификатору учётки. */
  lastLogins?: Map<string, string>;
  consents?: Map<string, boolean>;
}

const CURRENT = new Set<string>(CURRENT_ENROLLMENT_STATUSES);

export class InMemoryLearnersRepository implements LearnersRepository {
  constructor(
    private readonly rows: Learner[],
    /** `learnerId → контрагенты групп, куда он зачислен` — скоуп представителя заказчика. */
    private readonly learnerCounterparties: Map<string, string[]> = new Map(),
    private readonly seeds: InMemoryRegistrySeeds = {}
  ) {}

  async registryDetails(
    tenantId: string,
    learnerIds: readonly string[]
  ): Promise<Map<string, LearnerRegistryDetails>> {
    const result = new Map<string, LearnerRegistryDetails>();
    for (const id of learnerIds) {
      const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
      if (!row) continue;
      const details: LearnerRegistryDetails = {};
      const company = row.counterpartyId
        ? this.seeds.companyNames?.get(row.counterpartyId)
        : undefined;
      if (company) details.companyName = company;
      const current = (this.seeds.groupsByLearner?.get(id) ?? [])
        .filter((g) => CURRENT.has(g.status))
        .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt))[0];
      if (current) {
        details.currentGroupId = current.groupId;
        details.currentGroupName = current.groupName;
        details.currentGroupStatus = current.groupStatus;
      }
      const login = row.linkedIamUserId
        ? this.seeds.lastLogins?.get(row.linkedIamUserId)
        : undefined;
      if (login) details.lastLoginAt = login;
      details.consentGranted = this.seeds.consents?.get(id) ?? false;
      result.set(id, details);
    }
    return result;
  }

  async list(tenantId: string, query: LearnersListQuery): Promise<RegistryListPage<Learner>> {
    let items = this.rows.filter((row) => row.tenantId === tenantId);
    /* МГ-C3.2 (срез 11.1): те же фильтры, что в SQL. */
    if (query.companyId) items = items.filter((row) => row.counterpartyId === query.companyId);
    if (query.groupId) {
      items = items.filter((row) =>
        (this.seeds.groupsByLearner?.get(row.id) ?? []).some(
          (g) => g.groupId === query.groupId && CURRENT.has(g.status)
        )
      );
    }
    if (query.noEmail) items = items.filter((row) => !row.email);
    if (query.neverLoggedIn) {
      items = items.filter(
        (row) => !row.linkedIamUserId || !this.seeds.lastLogins?.has(row.linkedIamUserId)
      );
    }
    if (query.counterpartyId) {
      items = items.filter((row) =>
        (this.learnerCounterparties.get(row.id) ?? []).includes(query.counterpartyId!)
      );
    }
    if (query.status) items = items.filter((row) => row.status === query.status);
    if (query.q) {
      if (looksLikeSnils(query.q)) {
        const digits = normalizeSnils(query.q);
        items = items.filter((row) => this.sameSnils(row, digits));
      } else {
        const needle = query.q.toLowerCase();
        items = items.filter((row) =>
          `${row.lastName} ${row.firstName} ${row.middleName ?? ''} ${row.learnerNo ?? ''}`
            .toLowerCase()
            .includes(needle)
        );
      }
    }
    const column = query.sort?.column ?? 'created_at';
    const field = column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const direction = query.sort?.direction === 'desc' ? -1 : 1;
    items = [...items].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[field] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[field] ?? '');
      const cmp = av.localeCompare(bv) * direction;
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
    const from = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(from, from + query.pageSize).map((row) => ({ ...row })),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length
    };
  }

  async get(tenantId: string, id: string): Promise<Learner | null> {
    const found = this.rows.find((row) => row.tenantId === tenantId && row.id === id);
    return found ? { ...found } : null;
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
    return this.rows
      .filter((row) => row.tenantId === tenantId && this.sameSnils(row, digits))
      .map((row) => ({ ...row }));
  }

  async learnerIdsByUser(tenantId: string, userId: string): Promise<string[]> {
    return this.rows
      .filter((row) => row.tenantId === tenantId && row.linkedIamUserId === userId)
      .map((row) => row.id);
  }

  private sameSnils(row: Learner, digits: string): boolean {
    const hash = (row as unknown as { snilsHash?: unknown }).snilsHash;
    if (typeof hash === 'string') return hash === snilsBlindIndex(digits);
    return normalizeSnils(row.snils ?? '') === digits;
  }
}
