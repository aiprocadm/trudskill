import { AsyncTaskStatus } from '@trudskill/shared-types';
import { describe, expect, it } from 'vitest';

import { ASYNC_STATUS_OVERRIDES, ASYNC_STATUS_SEMANTIC_KEY, asyncStatusLabel } from './index.js';
import { statusAccessibleLabel } from '../badges/status-label.js';

/**
 * Слово и цвет статуса берутся из ОДНОГО источника (ТЗ «Стабилизация, UX и развитие», 16.4).
 *
 * **Что было.** У виджета фоновой задачи жил свой словарь подписей, и он расходился с общим:
 * `Canceled` звался здесь «Отменено», а в общем словаре — «Отменён». Цвет при этом брался из
 * общего источника: одно и то же состояние получало цвет из одного места, а слово — из другого
 * (журнал 546). Это ровно тот разнобой, ради которого 16.4 и просит «тексты как ресурс».
 *
 * **Что закреплено.** Слово берётся из общего словаря по тому же ключу, что и цвет. Там, где
 * общее слово предметной области не подходит, исключение ОБЪЯВЛЕНО и объяснено — а не спрятано
 * в частном словаре. Новый статус без слова и без объяснения не проедет.
 */

const ALL_STATUSES = Object.values(AsyncTaskStatus) as AsyncTaskStatus[];

describe('подписи фоновой задачи берутся из общего словаря (ТЗ 16.4)', () => {
  it('у каждого статуса есть ключ — иначе цвет уедет в «pending»', () => {
    expect(ALL_STATUSES.length, 'статусы должны читаться из общего типа').toBeGreaterThanOrEqual(5);
    for (const status of ALL_STATUSES) {
      expect(ASYNC_STATUS_SEMANTIC_KEY[status], `${status}: ключ не назначен`).toBeTruthy();
    }
  });

  it('слово совпадает с общим словарём везде, кроме объявленных исключений', () => {
    for (const status of ALL_STATUSES) {
      const override = ASYNC_STATUS_OVERRIDES[status];
      const shared = statusAccessibleLabel(ASYNC_STATUS_SEMANTIC_KEY[status]!);
      if (override) {
        expect(override.why, `${status}: исключение без причины`).toBeTruthy();
        expect(asyncStatusLabel(status)).toBe(override.label);
      } else {
        expect(asyncStatusLabel(status), `${status}: слово разошлось с общим словарём`).toBe(
          shared
        );
      }
    }
  });

  it('отменённая задача называется так же, как всё остальное отменённое', () => {
    /* Тот самый разъезд: «Отменено» против «Отменён» для одного и того же состояния. */
    expect(asyncStatusLabel(AsyncTaskStatus.Canceled)).toBe(statusAccessibleLabel('cancelled'));
    expect(asyncStatusLabel(AsyncTaskStatus.Canceled)).toBe('Отменён');
  });

  it('исключений ровно два, и оба про смысл, а не про вкус', () => {
    /*
     * Список исключений — не свалка. Два слова отличаются потому, что общий словарь обслуживает
     * и экзамены: «Не пройден» про экзамен, а задача завершается ОШИБКОЙ; «Завершён» не
     * отличает удачу от неудачи, а рядом стоит «Ошибка».
     */
    const declared = Object.keys(ASYNC_STATUS_OVERRIDES).sort();
    expect(declared).toEqual([AsyncTaskStatus.Failed, AsyncTaskStatus.Succeeded].sort());
    expect(asyncStatusLabel(AsyncTaskStatus.Failed)).toBe('Ошибка');
    expect(asyncStatusLabel(AsyncTaskStatus.Succeeded)).toBe('Успешно');
  });

  it('очередь и выполнение слово не выдумывают', () => {
    expect(asyncStatusLabel(AsyncTaskStatus.Queued)).toBe(statusAccessibleLabel('queued'));
    expect(asyncStatusLabel(AsyncTaskStatus.Running)).toBe(statusAccessibleLabel('running'));
  });
});
