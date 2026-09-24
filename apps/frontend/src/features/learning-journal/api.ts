import { apiRequest } from '../../lib/api/client';
import { frontendEnv } from '../../lib/config/env';

import type { UserSession } from '../../entities/session/model';

/**
 * Журнал учебных часов группы (ФТ-B3.4, Фаза 2 Task 8).
 *
 * Это доказательная база на проверке ГИТ/Минтруда: инспектор спрашивает не «стоит ли
 * галочка “пройдено”», а сколько часов слушатель реально отучился против плановых
 * часов программы.
 */

export interface LearningJournalEntryDto {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  enrollmentStatus: string;
  factHours: number;
  plannedHours?: number;
  completionPercent?: number;
  belowPlan: boolean;
  materialSeconds: number;
  videoSeconds: number;
  testSeconds: number;
  /** ФТ-F4 (Фаза 5 Task 9): посещённые вебинары группы. */
  webinarSeconds: number;
  /** МГ-B4.2 (срез 8.8): статистика посещений поверх часов; поля необязательные. */
  lastLoginAt?: string;
  progressPercent?: number;
  attemptsCount: number;
  bestScore?: number;
  maxScore?: number;
  examPassed?: boolean;
  resultCode?: string;
}

export interface LearningJournalDto {
  groupId: string;
  groupName: string;
  plannedAcademicHours?: number;
  entries: LearningJournalEntryDto[];
  belowPlanCount: number;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const learningJournalApi = {
  get: (session: UserSession, groupId: string) =>
    apiRequest<LearningJournalDto>(`/groups/${groupId}/learning-journal`, {
      auth: auth(session)
    })
};

export type LearningJournalFileFormat = 'csv' | 'xlsx';

/**
 * Выгрузка файлом: сервер отдаёт файл, а не конверт API, поэтому идём мимо `apiRequest`
 * и возвращаем object-URL — на проверке просят файл, а не скриншот. XLSX — МГ-B4.2.
 */
export async function fetchLearningJournalFileUrl(
  session: UserSession,
  groupId: string,
  format: LearningJournalFileFormat
): Promise<string> {
  const res = await fetch(
    `${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/groups/${groupId}/learning-journal.${format}`,
    {
      headers: {
        authorization: `Bearer ${session.tokens.accessToken}`,
        'x-tenant-id': session.user.tenantId
      }
    }
  );
  if (!res.ok) throw new Error(`Не удалось выгрузить журнал (HTTP ${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/** Прежнее имя для CSV — вызовы и тесты не переписываются. */
export const fetchLearningJournalCsvUrl = (session: UserSession, groupId: string) =>
  fetchLearningJournalFileUrl(session, groupId, 'csv');

/** Секунды в минуты — в отчёте нужны минуты, а не 145800. */
export function toMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}
