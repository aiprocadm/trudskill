import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Отправка прогресса просмотра (ФТ-B3.1, Фаза 2 Task 6).
 *
 * Клиент НЕ решает, пройден ли урок: он лишь сообщает, какие куски ролика реально
 * проиграны. Решение принимает сервер по покрытию — иначе «пройдено» правилось бы
 * из инструментов разработчика за минуту.
 */

export interface VideoProgressResultDto {
  coveragePercent: number;
  completed: boolean;
  lastPositionSeconds: number;
  maxPositionSeconds: number;
  requiredPercent: number;
}

/** Как часто шлём heartbeat — середина интервала 10–15 с из ТЗ. */
export const PROGRESS_HEARTBEAT_MS = 12_000;

/**
 * `video.played` — то, что браузер сам отметил как проигранное. Именно это нам и нужно:
 * перемотанные, но не показанные куски сюда не попадают.
 */
export function timeRangesToArray(ranges: TimeRanges | null | undefined): Array<[number, number]> {
  if (!ranges) return [];
  const result: Array<[number, number]> = [];
  for (let index = 0; index < ranges.length; index += 1) {
    result.push([ranges.start(index), ranges.end(index)]);
  }
  return result;
}

export const videoProgressApi = {
  send: (
    session: UserSession,
    materialId: string,
    input: { enrollmentId: string; positionSeconds: number; ranges: Array<[number, number]> }
  ) =>
    apiRequest<VideoProgressResultDto>(`/video-materials/${materialId}/progress`, {
      method: 'POST',
      body: input,
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
};
