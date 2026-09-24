import { GROUP_STATUS_LABEL, normalizeGroupStatus } from '../groups/group-status';
import { formatDateTime } from '../mvp/screen-helpers';

import type { LearnerRegistryDetails } from './types';

/**
 * Подписи сведений реестра (ТЗ перехода §6.4 МГ-C3.2; срез 11.2). Сведения приходят с сервера
 * только на базе (РМ103): их нет — колонка говорит «—», а не выдумывает «без группы».
 */
export const companyLabel = (details: LearnerRegistryDetails | undefined): string =>
  details ? (details.companyName ?? 'без компании') : '—';

export const currentGroupLabel = (details: LearnerRegistryDetails | undefined): string => {
  if (!details) return '—';
  if (!details.currentGroupName) return 'без группы';
  const status = normalizeGroupStatus(details.currentGroupStatus);
  return status
    ? `${details.currentGroupName} · ${GROUP_STATUS_LABEL[status]}`
    : details.currentGroupName;
};

export const lastLoginLabel = (details: LearnerRegistryDetails | undefined): string =>
  details ? (details.lastLoginAt ? formatDateTime(details.lastLoginAt) : 'не входил') : '—';

export const consentLabel = (details: LearnerRegistryDetails | undefined): string =>
  details?.consentGranted === undefined ? '—' : details.consentGranted ? 'действует' : 'нет';
