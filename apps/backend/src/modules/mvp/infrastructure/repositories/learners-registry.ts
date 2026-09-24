import { type RegistryListQuery, parseRegistryListQuery } from './registry-list-query.js';

import type { BaseFilterQuery } from '../../mvp.dto.js';
import type { Learner } from '../../mvp.types.js';

/**
 * Реестр слушателей (ТЗ перехода §6.4 МГ-C3.2; срез 11.1, РМ103–РМ105): фильтры компании,
 * группы, «без почты», «не входил» и сведения для колонок «Компания», «Группа (текущая)»,
 * «Последний вход», «Согласие ПДн». Сведения — отдельным запросом по странице, а не
 * соединением в списке: список остаётся на индексах, а четыре подзапроса идут по идентификаторам.
 */
export interface LearnersListQuery extends RegistryListQuery {
  /** Компания-работодатель слушателя (`counterparty_id`), не скоуп представителя. */
  companyId?: string;
  /** Есть незавершённое зачисление в эту группу. */
  groupId?: string;
  /** Почты нет — таким нельзя выслать доступ, их и ищут. */
  noEmail?: boolean;
  /** Ни одного входа: учётки нет или сессий по ней не было. */
  neverLoggedIn?: boolean;
}

/** Сведения реестра по одному слушателю — то, чего нет в самой карточке. */
export interface LearnerRegistryDetails {
  companyName?: string;
  currentGroupId?: string;
  currentGroupName?: string;
  currentGroupStatus?: string;
  lastLoginAt?: string;
  /** Согласие на обработку ПДн действует (последний факт не отозван). */
  consentGranted?: boolean;
}

/** Строка реестра: карточка плюс сведения (в снимке без базы сведений нет — колонки пустые). */
export type LearnerRegistryRow = Learner & { registry?: LearnerRegistryDetails };

/** Зачисления, которые считаются «текущей группой»: не отменённые и не завершённые. */
export const CURRENT_ENROLLMENT_STATUSES = ['pending', 'active', 'suspended'] as const;

/** Предел строк выгрузки XLSX — реестр, а не архив: больше просят отчётом с фильтром. */
export const LEARNERS_EXPORT_MAX_ROWS = 5000;

const flag = (raw: unknown): boolean =>
  typeof raw === 'string'
    ? ['1', 'true', 'yes', 'да'].includes(raw.trim().toLowerCase())
    : raw === true;

export const parseLearnersListQuery = (
  query: BaseFilterQuery,
  sortColumns: Record<string, string>,
  scope?: { counterpartyId?: string }
): LearnersListQuery => {
  const base = parseRegistryListQuery(query, sortColumns, scope);
  const result: LearnersListQuery = { ...base };
  const companyId = typeof query.client_id === 'string' ? query.client_id.trim() : '';
  if (companyId) result.companyId = companyId;
  const groupId = typeof query.group_id === 'string' ? query.group_id.trim() : '';
  if (groupId) result.groupId = groupId;
  if (flag(query.no_email)) result.noEmail = true;
  if (flag(query.never_logged_in)) result.neverLoggedIn = true;
  return result;
};
