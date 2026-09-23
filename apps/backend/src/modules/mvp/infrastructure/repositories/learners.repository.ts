import type { LookupItem, RegistryListPage, RegistryListQuery } from './registry-list-query.js';
import type { Learner } from '../../mvp.types.js';

/**
 * Репозиторий слушателей (МГ-A1.1/A1.2, Фаза 1 срез 2b). Читает `learning.learners`, которую
 * наполняют бэкфилл и проекция при сохранении снимка. ПДн приходят из таблицы ШИФРТЕКСТОМ
 * (`snils/email/phone/dateOfBirth` = `enc:…`, плюс `snilsHash`): расшифровка — забота сервиса
 * чтения, как у снимка расшифровка живёт на границе загрузки.
 *
 * Поиск `q` (МГ-A2.1): по ФИО (триграммный индекс 0109), по табельному номеру и по ТОЧНОМУ
 * СНИЛС через слепой индекс — частичный СНИЛС, почта и телефон не ищутся (РМ38).
 */
export const LEARNERS_REPOSITORY = Symbol('LEARNERS_REPOSITORY');

export interface LearnersRepository {
  list(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<Learner>>;
  get(tenantId: string, id: string): Promise<Learner | null>;
  lookup(tenantId: string, query: RegistryListQuery): Promise<RegistryListPage<LookupItem>>;
  /** Все слушатели центра с этим СНИЛС (по слепому индексу; вход в любом написании). */
  findBySnils(tenantId: string, snils: string): Promise<Learner[]>;
}
