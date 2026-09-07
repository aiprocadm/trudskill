import { describe, expect, it } from 'vitest';

import { confirmBlocked } from './use-confirm.js';

/**
 * `CMP-005`: необратимое действие подтверждается вводом.
 *
 * Опасное действие отличается красной кнопкой — этого хватает, пока действие можно отменить.
 * Там, где нельзя (отзыв лицензии, отмена оплаченного заказа), цвет руку не останавливает:
 * человек нажимает в списке из двадцати строк, промахнувшись на одну.
 */
describe('когда кнопку подтверждения нажать нельзя', () => {
  it('без требования ввода кнопка доступна сразу', () => {
    expect(confirmBlocked({}, { value: '', typed: '' })).toBe(false);
  });

  it('пока нужное слово не введено — кнопка закрыта', () => {
    const request = { requireTyping: { word: 'Л035-001', label: 'Введите номер' } };

    expect(confirmBlocked(request, { value: '', typed: '' })).toBe(true);
    expect(confirmBlocked(request, { value: '', typed: 'Л035' })).toBe(true);
    expect(confirmBlocked(request, { value: '', typed: 'Л035-002' })).toBe(true);
  });

  it('введено верно — кнопка открывается', () => {
    const request = { requireTyping: { word: 'Л035-001', label: 'Введите номер' } };

    expect(confirmBlocked(request, { value: '', typed: 'Л035-001' })).toBe(false);
  });

  it('регистр и пробелы по краям не мешают: смысл ввода — осознанность, а не набор', () => {
    const request = { requireTyping: { word: 'Л035-001', label: 'Введите номер' } };

    expect(confirmBlocked(request, { value: '', typed: '  л035-001 ' })).toBe(false);
  });

  it('обязательное поле причины и ввод подтверждения действуют вместе', () => {
    // Аннулирование просит причину И подтверждение: ни одно не отменяет другого.
    const request = {
      input: { label: 'Причина', required: true },
      requireTyping: { word: 'A-77', label: 'Введите номер' }
    };

    expect(confirmBlocked(request, { value: '', typed: 'A-77' })).toBe(true);
    expect(confirmBlocked(request, { value: 'ошибка в ФИО', typed: '' })).toBe(true);
    expect(confirmBlocked(request, { value: 'ошибка в ФИО', typed: 'A-77' })).toBe(false);
  });
});
