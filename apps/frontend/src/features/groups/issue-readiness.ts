'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../lib/api/client';
import { useAuth } from '../auth/context';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';

export interface IssueReadinessItem {
  code: string;
  message: string;
}

export interface IssueReadinessReport {
  ready: boolean;
  center: IssueReadinessItem[];
  group: IssueReadinessItem[];
  learners: Array<{ learnerId: string; learnerName: string; issues: IssueReadinessItem[] }>;
  totals: { learners: number; learnersReady: number };
  consentRequired: boolean;
}

/** МГ-F5.1 (срез 20.1): «что мешает выпустить документы» группы — центр, группа, слушатели. */
export const issueReadinessApi = {
  fetch: (session: UserSession, groupId: string): Promise<IssueReadinessReport> =>
    apiRequest<IssueReadinessReport>(
      `/groups/${encodeURIComponent(groupId)}/issue-readiness`,
      withAuth(session)
    )
};

export function useIssueReadiness(groupId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['issue-readiness', groupId],
    enabled: Boolean(session) && Boolean(groupId),
    queryFn: () => issueReadinessApi.fetch(session!, groupId),
    meta: { suppressGlobalErrorToast: true }
  });
}

/** Сводка одной строкой — заголовок раздела отвечает «можно выпускать или нет». */
export const readinessSummary = (report: IssueReadinessReport): string => {
  if (report.ready) {
    return report.totals.learners === 0
      ? 'В группе пока нет слушателей — выпускать некому.'
      : `Всё готово к выпуску документов: слушателей — ${report.totals.learners}.`;
  }
  const parts: string[] = [];
  if (report.center.length > 0) parts.push('центр настроен не до конца');
  if (report.group.length > 0) parts.push('есть вопросы по группе');
  const blocked = report.totals.learners - report.totals.learnersReady;
  if (blocked > 0) parts.push(`не готовы слушатели: ${blocked} из ${report.totals.learners}`);
  return `Выпуск пока не пройдёт: ${parts.join('; ')}.`;
};
