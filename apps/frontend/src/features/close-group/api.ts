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

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const closeGroupApi = {
  close: (session: UserSession, input: CloseGroupInput) =>
    apiRequest<CloseGroupResultDto>('/admin/documents/close-group', {
      method: 'POST',
      body: input,
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
