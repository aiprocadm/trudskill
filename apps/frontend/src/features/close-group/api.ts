import { apiRequest } from '../../lib/api/client';
import { frontendEnv } from '../../lib/config/env';

import type { UserSession } from '../../entities/session/model';

/**
 * Закрытие группы (ФТ-A5, Фаза 1 Task 7b).
 *
 * Одна операция вместо 26 нажатий на группе из 25 человек: протокол на группу
 * и удостоверение каждому сдавшему. Повторный запуск безопасен — сервер добивает
 * только упавшие, готовые не трогает.
 */

export interface CloseGroupInput {
  groupId: string;
  protocolTemplateId: string;
  certificateTemplateId: string;
  enrollmentIds: string[];
}

export interface CloseGroupTaskDto {
  id: string;
  status: string;
  documentType: string;
  sourceEntityId: string;
}

export interface CloseGroupResultDto {
  protocol: CloseGroupTaskDto;
  certificates: CloseGroupTaskDto[];
  created: number;
  retried: number;
}

export interface GroupClosureStatusDto {
  groupId: string;
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  isComplete: boolean;
}

/**
 * ФТ-E3 (Фаза 5 Task 7): цепочка «экзамен → протокол → документы → строки реестра».
 * Список зачислений не передаётся — сервер сам отбирает сдавших; отсеянные
 * возвращаются поимённо с причиной (частичный успех).
 */
export interface CloseGroupChainInput {
  groupId: string;
  courseId: string;
  protocolTemplateId: string;
  certificateTemplateId: string;
  /** Повтор с тем же ключом возвращает прежний отчёт и не создаёт вторую выгрузку. */
  idempotencyKey: string;
}

export interface ChainSkippedDto {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  code: string;
  message: string;
}

export interface CloseGroupChainOutcomeDto {
  eligible: number;
  skipped: ChainSkippedDto[];
  documents: {
    protocolTaskId: string;
    certificates: number;
    created: number;
    retried: number;
  } | null;
  registry: {
    batchId: string;
    total: number;
    exported: number;
    failed: number;
    errors: Array<{ enrollmentId: string; fullName: string; field: string; message: string }>;
  } | null;
  cached: boolean;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

/** Итог массового закрытия групп (вопрос №13). */
export interface CloseGroupsBulkOutcomeDto {
  total: number;
  closed: number;
  skipped: number;
  rows: Array<{
    groupId: string;
    groupName: string;
    status: 'closed' | 'skipped';
    reason?: string;
    issued?: number;
    skippedLearners?: Array<{ fullName: string; message: string }>;
  }>;
}

export const closeGroupApi = {
  /**
   * Массовое закрытие групп (вопрос №13). Курс не передаётся — сервер берёт его у группы,
   * а группу с двумя курсами возвращает строкой отчёта, а не молча закрывает наугад.
   */
  closeChainBulk: (
    session: UserSession,
    input: {
      groupIds: string[];
      protocolTemplateId: string;
      certificateTemplateId: string;
      idempotencyKey: string;
    }
  ) =>
    apiRequest<CloseGroupsBulkOutcomeDto>('/groups/close-chain-bulk', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  close: (session: UserSession, input: CloseGroupInput) =>
    apiRequest<CloseGroupResultDto>('/admin/documents/close-group', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  closeChain: (session: UserSession, input: CloseGroupChainInput) =>
    apiRequest<CloseGroupChainOutcomeDto>(`/groups/${input.groupId}/close-chain`, {
      method: 'POST',
      body: {
        courseId: input.courseId,
        protocolTemplateId: input.protocolTemplateId,
        certificateTemplateId: input.certificateTemplateId,
        idempotencyKey: input.idempotencyKey
      },
      auth: auth(session)
    }),

  status: (session: UserSession, groupId: string) =>
    apiRequest<GroupClosureStatusDto>(`/admin/documents/close-group/${groupId}`, {
      auth: auth(session)
    }),

  /**
   * Тянет ZIP бинарно (мимо конверта API) — тем же путём, что экспорт книги
   * выдачи в CSV. Вынесено из `downloadPackage`, чтобы сетевую часть и имя файла
   * можно было проверить тестом: DOM во фронтовых тестах проекта недоступен
   * (jsdom не в зависимостях, см. CLAUDE.md «No React Testing Library»).
   */
  fetchPackage: async (
    session: UserSession,
    groupId: string
  ): Promise<{ blob: Blob; filename: string }> => {
    const url = `${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/admin/documents/close-group/${groupId}/package`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.tokens.accessToken}`,
        'X-Tenant-Id': session.user.tenantId
      }
    });
    if (!response.ok) {
      throw new Error(`Не удалось скачать комплект группы: ${response.status}`);
    }
    return { blob: await response.blob(), filename: `group-${groupId}.zip` };
  },

  /** Обёртка с побочным эффектом браузера — как `issuanceJournalApi.downloadCsv`. */
  downloadPackage: async (session: UserSession, groupId: string): Promise<void> => {
    const { blob, filename } = await closeGroupApi.fetchPackage(session, groupId);
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);
  }
};

/** Человеческая формулировка прогресса — админу нужен ответ «готово или нет». */
export function describeProgress(status: GroupClosureStatusDto): string {
  if (status.total === 0) return 'Группа ещё не закрывалась';
  if (status.isComplete) return `Готово: ${status.completed} из ${status.total}`;
  const parts = [`готово ${status.completed} из ${status.total}`];
  if (status.failed > 0) parts.push(`с ошибкой ${status.failed}`);
  if (status.running > 0) parts.push(`в работе ${status.running}`);
  if (status.queued > 0) parts.push(`в очереди ${status.queued}`);
  return parts.join(', ');
}
