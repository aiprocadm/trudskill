import { describe, expect, it } from 'vitest';

import {
  ERROR_TOAST_POLICY,
  createToastDeduper,
  shouldShowErrorToast,
  toastDedupeKey
} from './error-toast-policy';

/**
 * Одинаковое сообщение показывается один раз (ТЗ «Стабилизация, UX и развитие», 2.3 / Б5).
 *
 * Как было: повторы гасились по ключу ЗАПРОСА. На «Обмене данными» три запроса — поставщики,
 * ключи доступа, журнал — падали одинаково и давали три одинаковые всплывашки подряд. ТЗ
 * требует ключ «текст + код»: человек читает текст, а не внутреннее имя запроса.
 */

const apiError = (code: string, message: string) =>
  Object.assign(new Error(message), { normalized: { code, status: 401 } });

describe('правила всплывашек об ошибках (ТЗ 2.3)', () => {
  it('одинаковый текст из РАЗНЫХ запросов гасится — в этом и была беда', () => {
    const deduper = createToastDeduper({ dedupeMs: 5_000 });
    const first = apiError('upstream_unavailable', 'Не удалось загрузить. Повторите.');
    const second = apiError('upstream_unavailable', 'Не удалось загрузить. Повторите.');

    expect(deduper.allow(first, 1_000)).toBe(true);
    expect(deduper.allow(second, 1_500), 'второй такой же — молча').toBe(false);
  });

  it('разные по смыслу ошибки друг друга не глушат', () => {
    const deduper = createToastDeduper({ dedupeMs: 5_000 });
    expect(deduper.allow(apiError('conflict', 'Такая запись уже есть.'), 1_000)).toBe(true);
    expect(deduper.allow(apiError('not_found', 'Запись не найдена.'), 1_100)).toBe(true);
  });

  it('один текст с разными кодами — разные события, оба показываются', () => {
    /* «Не удалось загрузить» приходит и отказом сервера, и обрывом связи: действия разные. */
    const deduper = createToastDeduper({ dedupeMs: 5_000 });
    expect(deduper.allow(apiError('network_unavailable', 'Не удалось загрузить.'), 1_000)).toBe(
      true
    );
    expect(deduper.allow(apiError('upstream_unavailable', 'Не удалось загрузить.'), 1_050)).toBe(
      true
    );
  });

  it('после срока тот же текст показывается снова', () => {
    const deduper = createToastDeduper({ dedupeMs: 5_000 });
    const error = apiError('conflict', 'Такая запись уже есть.');
    expect(deduper.allow(error, 1_000)).toBe(true);
    expect(deduper.allow(error, 6_500), 'прошло больше срока — это уже новое событие').toBe(true);
  });

  it('про истёкшую сессию всплывашки нет вовсе: человека уводят на вход', () => {
    expect(shouldShowErrorToast(apiError('auth_required', 'Вход не выполнен.'))).toBe(false);
    expect(shouldShowErrorToast(apiError('session_inactive', 'Сессия завершена.'))).toBe(false);
    expect(shouldShowErrorToast(apiError('conflict', 'Такая запись уже есть.'))).toBe(true);
  });

  it('срок — настройка со значением по умолчанию, а не число в коде', () => {
    expect(ERROR_TOAST_POLICY.dedupeMs).toBe(5_000);
  });

  it('ключ повтора собран из кода и текста', () => {
    const key = toastDedupeKey(apiError('conflict', 'Такая запись уже есть.'));
    expect(key).toContain('conflict');
    expect(key).toContain('Такая запись уже есть.');
  });

  it('не-ошибка тоже получает ключ и не роняет разбор', () => {
    expect(toastDedupeKey('просто строка')).toContain('просто строка');
  });
});
