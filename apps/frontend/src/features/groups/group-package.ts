'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../lib/api/client';
import { useAuth } from '../auth/context';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';
import type { BulkOutcome } from '@trudskill/ui';

export type PackageKindState = 'not_started' | 'in_progress' | 'partial' | 'issued' | 'failed';

export interface PackageKindRow {
  key: string;
  kindCode?: string;
  title: string;
  scope: 'group' | 'learner';
  templateId: string;
  isRequired: boolean;
  expected: number;
  issued: number;
  inProgress: number;
  failed: number;
  state: PackageKindState;
  documentIds: string[];
}

export interface GroupPackageView {
  groupId: string;
  learners: number;
  kinds: PackageKindRow[];
}

export interface GroupPackageIssueInput {
  kinds?: string[];
  protocolDate?: string;
  orderDate?: string;
}

export interface GroupPackageIssueOutcome {
  tasks: number;
  created: number;
  retried: number;
  learnersIncluded: number;
  skipped: Array<{ enrollmentId: string; learnerName: string; reasons: string[] }>;
  groupStatus: string;
}

/** МГ-F2.1 (срез 21.2): пакет документов группы — «вид × состояние» и выпуск. */
export const groupPackageApi = {
  view: (session: UserSession, groupId: string): Promise<GroupPackageView> =>
    apiRequest<GroupPackageView>(
      `/groups/${encodeURIComponent(groupId)}/document-package`,
      withAuth(session)
    ),
  issuePackage: (
    session: UserSession,
    groupId: string,
    input: GroupPackageIssueInput
  ): Promise<GroupPackageIssueOutcome> =>
    apiRequest<GroupPackageIssueOutcome>(
      `/groups/${encodeURIComponent(groupId)}/document-package/issue`,
      { method: 'POST', body: input, ...withAuth(session) }
    )
};

export function useGroupPackage(groupId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['group-package', groupId],
    enabled: Boolean(session) && Boolean(groupId),
    queryFn: () => groupPackageApi.view(session!, groupId),
    meta: { suppressGlobalErrorToast: true }
  });
}

/** Состояние словом, а не кодом (`TXT-006`). */
export const PACKAGE_STATE_LABELS: Record<PackageKindState, string> = {
  not_started: 'Не выпускался',
  in_progress: 'Выпускается',
  partial: 'Выпущен не всем',
  issued: 'Выпущен',
  failed: 'Ошибка выпуска'
};

/** Столбец «Выпущено»: для документа на группу — «да/нет», для слушателей — «N из M». */
export const issuedView = (row: Pick<PackageKindRow, 'scope' | 'issued' | 'expected'>): string =>
  row.scope === 'group' ? (row.issued > 0 ? 'да' : 'нет') : `${row.issued} из ${row.expected}`;

/** Что выпускать по умолчанию: всё, что ещё не выпущено целиком. */
export const defaultKinds = (rows: readonly PackageKindRow[]): string[] =>
  rows.filter((row) => row.state !== 'issued').map((row) => row.key);

/** Итог выпуска для человека: включённые — «готово», пропущенные — поимённо с причинами. */
export const toPackageOutcome = (outcome: GroupPackageIssueOutcome): BulkOutcome => ({
  total: outcome.learnersIncluded + outcome.skipped.length,
  succeeded: outcome.learnersIncluded,
  failures: outcome.skipped.map((s) => ({ label: s.learnerName, reason: s.reasons.join('; ') }))
});
