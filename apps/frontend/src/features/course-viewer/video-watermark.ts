import type { CurrentUser } from '../../entities/session/model';

/**
 * Динамический водяной знак поверх видео (ФТ-B2.2, Фаза 2 Task 5).
 *
 * Зачем он вообще нужен: скачать показанное видео технически может любой браузер, и
 * запретить это невозможно (см. комментарий в `hls-video-player.tsx`). Работающая мера —
 * не прятать файл, а сделать запись **именной**: перепродавать или выкладывать ролик,
 * на котором весь сеанс висит твоя фамилия и почта, желающих намного меньше.
 *
 * Поэтому знак обязан: (1) нести данные конкретного слушателя, (2) двигаться — статичную
 * надпись заклеивают одним прямоугольником при перезаписи экрана.
 */

/** Подпись на видео: ФИО и почта слушателя. Без почты — только имя, пустых скобок не рисуем. */
export function watermarkLabel(user: Pick<CurrentUser, 'displayName' | 'email'>): string {
  const name = user.displayName?.trim() ?? '';
  const email = user.email?.trim() ?? '';
  if (name && email) return `${name} · ${email}`;
  return name || email;
}

export interface WatermarkPosition {
  topPercent: number;
  leftPercent: number;
}

/**
 * Маршрут перемещения знака. Позиции подобраны так, чтобы:
 *   * не залезать в нижние 20% — там панель управления плеером, знак перекрывал бы кнопки;
 *   * не выходить за правый край: надпись длинная, поэтому левая координата не больше 55%;
 *   * соседние позиции были далеко друг от друга — иначе «движение» незаметно и знак
 *     всё равно закрывается одним прямоугольником.
 */
const ROUTE: readonly WatermarkPosition[] = [
  { topPercent: 8, leftPercent: 6 },
  { topPercent: 55, leftPercent: 52 },
  { topPercent: 30, leftPercent: 10 },
  { topPercent: 12, leftPercent: 55 },
  { topPercent: 62, leftPercent: 8 },
  { topPercent: 40, leftPercent: 48 }
];

/** Каждые 25 с — середина рекомендованного ТЗ интервала 20–30 с. */
export const WATERMARK_MOVE_INTERVAL_MS = 25_000;

/** Позиция знака на шаге `step`; маршрут зациклен, отрицательные шаги не ломают расчёт. */
export function watermarkPositionAt(step: number): WatermarkPosition {
  const index = ((Math.trunc(step) % ROUTE.length) + ROUTE.length) % ROUTE.length;
  return ROUTE[index]!;
}

/** Длина маршрута — нужна тестам и подсказывает, через сколько шагов знак повторится. */
export const WATERMARK_ROUTE_LENGTH = ROUTE.length;
