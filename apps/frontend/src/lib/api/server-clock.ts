/**
 * Ревизия 2026-08-27 (порция 25, журнал 275) — часы сервера для обратного отсчёта.
 *
 * **Зачем.** Таймер попытки считался по часам УСТРОЙСТВА: `expiresAt − Date.now()`.
 * Если часы слушателя отстают (обычное дело на домашнем компьютере или планшете без
 * синхронизации), таймер показывает больше времени, чем осталось на самом деле, —
 * и автосдача уезжает за срок. Слушатель видел «ещё 2 минуты», а на сервере время
 * уже вышло: попытка просрочена, ответы не оценены.
 *
 * **Как.** Каждый ответ сервера несёт своё время в конверте (`meta.timestamp`).
 * По нему оценивается сдвиг часов; оценка берётся с поправкой на половину дороги
 * туда-обратно — как в протоколах синхронизации времени. Из нескольких оценок
 * выигрывает та, что получена по самому быстрому ответу: чем короче дорога, тем
 * меньше в ней неизвестного.
 *
 * Точности до секунды достаточно: сервер принимает сдачу с технологическим допуском
 * (`ATTEMPT_EXPIRY_GRACE_MS`). Задача этого модуля — не дать разъехаться на минуты.
 */

interface ClockEstimate {
  /** Насколько часы сервера впереди часов устройства, мс (может быть отрицательным). */
  offsetMs: number;
  /** Дорога туда-обратно у ответа, по которому сделана оценка, мс. */
  roundTripMs: number;
}

let estimate: ClockEstimate | null = null;

/**
 * Учесть время из конверта ответа. `sentAtMs`/`receivedAtMs` — засечки клиента вокруг
 * запроса. Неразбираемое время игнорируется молча: сверка часов — вспомогательная
 * задача, ронять из-за неё запрос нельзя.
 */
export function noteServerTime(
  serverTimestamp: string,
  sentAtMs: number,
  receivedAtMs: number
): void {
  const serverMs = new Date(serverTimestamp).getTime();
  if (!Number.isFinite(serverMs)) return;
  const roundTripMs = receivedAtMs - sentAtMs;
  if (!Number.isFinite(roundTripMs) || roundTripMs < 0) return;
  // Считаем, что ответ сформирован примерно на середине дороги.
  const offsetMs = serverMs - (sentAtMs + roundTripMs / 2);
  if (!estimate || roundTripMs <= estimate.roundTripMs) {
    estimate = { offsetMs, roundTripMs };
  }
}

/** «Сейчас» по часам сервера. Без единой сверки — часы устройства, как раньше. */
export function serverNow(): number {
  return Date.now() + (estimate?.offsetMs ?? 0);
}

/** Оценка сдвига часов, мс (для показа в диагностике). `null` — сверки ещё не было. */
export function serverClockOffsetMs(): number | null {
  return estimate?.offsetMs ?? null;
}

/** Только для тестов: забыть накопленную оценку. */
export function resetServerClockForTests(): void {
  estimate = null;
}
