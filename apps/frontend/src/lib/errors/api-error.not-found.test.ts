import { describe, expect, it } from 'vitest';

import { isNotFoundError, normalizeApiError } from './api-error';

/**
 * Отличать «такой записи нет» от «связь оборвалась» приходится на каждой карточке: первое
 * лечится возвратом к списку, второе — повтором. Показать «Курс не найден» при отвалившемся
 * интернете — соврать и увести человека не туда.
 */
describe('признак «записи нет»', () => {
  const asThrown = (status: number, payload: unknown) => ({
    normalized: normalizeApiError(status, payload)
  });

  it('404 от сервера — это «не найдено»', () => {
    expect(
      isNotFoundError(asThrown(404, { error: { code: 'not_found', message: 'Entity not found' } }))
    ).toBe(true);
  });

  it('код `not_found` при другом статусе — тоже «не найдено»', () => {
    expect(isNotFoundError(asThrown(409, { error: { code: 'not_found', message: '' } }))).toBe(
      true
    );
  });

  it('сбой сервера «не найденным» не считается', () => {
    expect(isNotFoundError(asThrown(500, { error: { code: 'internal_error', message: '' } }))).toBe(
      false
    );
  });

  it('нет доступа — это не «нет записи»', () => {
    /* Иначе человеку скажут «запись удалили» там, где ему просто не хватает права. */
    expect(isNotFoundError(asThrown(403, { error: { code: 'forbidden', message: '' } }))).toBe(
      false
    );
  });

  it('обрыв связи и мусор не ломают проверку', () => {
    for (const junk of [null, undefined, new Error('Failed to fetch'), 'строка', {}]) {
      expect(isNotFoundError(junk), String(junk)).toBe(false);
    }
  });
});
