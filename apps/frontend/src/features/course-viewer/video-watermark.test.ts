import { describe, expect, it } from 'vitest';

import {
  WATERMARK_MOVE_INTERVAL_MS,
  WATERMARK_ROUTE_LENGTH,
  watermarkLabel,
  watermarkPositionAt
} from './video-watermark';

/**
 * Динамический водяной знак (ФТ-B2.2, Фаза 2 Task 5).
 * Защищаемся не от скачивания (оно неотключаемо), а от перепродажи: запись именная.
 */

describe('watermarkLabel', () => {
  it('несёт и ФИО, и почту слушателя — по ним запись опознаётся', () => {
    expect(watermarkLabel({ displayName: 'Иванов Иван Иванович', email: 'ivan@example.org' })).toBe(
      'Иванов Иван Иванович · ivan@example.org'
    );
  });

  it('без почты показывает только имя, без висящего разделителя', () => {
    expect(watermarkLabel({ displayName: 'Иванов Иван', email: null })).toBe('Иванов Иван');
    expect(watermarkLabel({ displayName: 'Иванов Иван', email: '   ' })).toBe('Иванов Иван');
  });

  it('без имени показывает почту — знак не должен исчезать целиком', () => {
    expect(watermarkLabel({ displayName: '', email: 'ivan@example.org' })).toBe('ivan@example.org');
  });

  it('пустой пользователь даёт пустую подпись — компонент такой знак не рисует', () => {
    expect(watermarkLabel({ displayName: '', email: null })).toBe('');
  });
});

describe('watermarkPositionAt', () => {
  it('знак действительно двигается: соседние шаги дают разные позиции', () => {
    for (let step = 0; step < WATERMARK_ROUTE_LENGTH; step += 1) {
      const current = watermarkPositionAt(step);
      const next = watermarkPositionAt(step + 1);
      expect(current).not.toEqual(next);
    }
  });

  it('соседние позиции разнесены далеко — иначе движение незаметно', () => {
    for (let step = 0; step < WATERMARK_ROUTE_LENGTH; step += 1) {
      const a = watermarkPositionAt(step);
      const b = watermarkPositionAt(step + 1);
      const distance =
        Math.abs(a.topPercent - b.topPercent) + Math.abs(a.leftPercent - b.leftPercent);
      expect(distance).toBeGreaterThanOrEqual(30);
    }
  });

  it('не залезает в нижние 20% — там панель управления плеером', () => {
    for (let step = 0; step < WATERMARK_ROUTE_LENGTH; step += 1) {
      expect(watermarkPositionAt(step).topPercent).toBeLessThanOrEqual(80);
    }
  });

  it('не уходит за правый край: подпись длинная', () => {
    for (let step = 0; step < WATERMARK_ROUTE_LENGTH; step += 1) {
      const { leftPercent, topPercent } = watermarkPositionAt(step);
      expect(leftPercent).toBeGreaterThanOrEqual(0);
      expect(leftPercent).toBeLessThanOrEqual(55);
      expect(topPercent).toBeGreaterThanOrEqual(0);
    }
  });

  it('маршрут зациклен и не ломается на отрицательных и дробных шагах', () => {
    expect(watermarkPositionAt(WATERMARK_ROUTE_LENGTH)).toEqual(watermarkPositionAt(0));
    expect(watermarkPositionAt(-1)).toEqual(watermarkPositionAt(WATERMARK_ROUTE_LENGTH - 1));
    expect(watermarkPositionAt(1.9)).toEqual(watermarkPositionAt(1));
  });

  it('интервал перемещения — в рекомендованных ТЗ пределах 20–30 секунд', () => {
    expect(WATERMARK_MOVE_INTERVAL_MS).toBeGreaterThanOrEqual(20_000);
    expect(WATERMARK_MOVE_INTERVAL_MS).toBeLessThanOrEqual(30_000);
  });
});
