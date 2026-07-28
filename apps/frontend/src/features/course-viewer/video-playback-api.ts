import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Ссылка на просмотр видео (ФТ-B2.1, Фаза 2 Task 4).
 *
 * Ссылка живёт минуты и привязана к зачислению: скопированная ссылка протухает раньше,
 * чем её успеют кому-то передать. Поэтому плеер обязан обновлять её сам, а не получать
 * один раз при открытии урока.
 */

export interface PlaybackSourceDto {
  url: string;
  kind: 'hls' | 'progressive';
  expiresInSeconds: number;
  durationSeconds?: number;
  /** ФТ-B3.3: секунда, с которой продолжить просмотр. 0 — урок ещё не открывали. */
  lastPositionSeconds: number;
}

export const videoPlaybackApi = {
  get: (session: UserSession, materialId: string, enrollmentId: string) =>
    apiRequest<PlaybackSourceDto>(`/video-materials/${materialId}/playback`, {
      method: 'POST',
      body: { enrollmentId },
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
};

/**
 * Когда просить новую ссылку. Берём 80% срока жизни, но не меньше 30 секунд:
 * обновиться надо ДО истечения, иначе плеер встанет посреди урока, и не слишком часто,
 * чтобы не долбить сервер на каждом уроке.
 */
export function refreshDelayMs(expiresInSeconds: number): number {
  const safeSeconds = Math.max(30, Math.floor(expiresInSeconds * 0.8));
  return safeSeconds * 1000;
}
