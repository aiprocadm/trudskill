import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Открытие документа урока (ФТ-B4.1, Фаза 2 Task 9).
 *
 * Один запрос делает две вещи: отдаёт ссылку на файл и фиксирует факт открытия.
 * Разделять их незачем — «ознакомлен» и есть «открыл», а два запроса дали бы
 * возможность получить ссылку, не отметившись.
 */
export interface DocumentMaterialViewDto {
  url: string;
  expiresInSeconds: number;
  /** Засчитан ли материал самим фактом открытия (зависит от настройки урока). */
  completedByOpening: boolean;
}

export const documentMaterialApi = {
  open: (session: UserSession, materialId: string, enrollmentId: string) =>
    apiRequest<DocumentMaterialViewDto>(`/document-materials/${materialId}/open`, {
      method: 'POST',
      body: { enrollmentId },
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
};
