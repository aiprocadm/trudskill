import { describe, expect, it } from 'vitest';

import { canSaveDraft, shouldHydrateDraft } from './draft-rules';

/*
 * Ревизия 2026-08-27 (порция 27, журнал 279): сохранённый черновик практической работы
 * не показывался после возврата к заданию, а «Сохранить черновик» отправлял пустое поле
 * поверх написанного раньше.
 */
describe('черновик практической работы (порция 27)', () => {
  describe('подстановка сохранённого текста', () => {
    it('подставляется, когда сервер ответил', () => {
      expect(shouldHydrateDraft({ alreadyHydrated: false, serverText: 'мой ответ' })).toBe(true);
    });

    it('пустой ответ с сервера — тоже ответ: подставляется', () => {
      expect(shouldHydrateDraft({ alreadyHydrated: false, serverText: '' })).toBe(true);
    });

    it('пока сервер не ответил — не подставляется', () => {
      expect(shouldHydrateDraft({ alreadyHydrated: false, serverText: undefined })).toBe(false);
    });

    it('второй раз не подставляется: человек мог уже править поле', () => {
      expect(shouldHydrateDraft({ alreadyHydrated: true, serverText: 'с сервера' })).toBe(false);
    });
  });

  describe('кнопка «Сохранить черновик»', () => {
    const base = { editable: true, saving: false, awaitingServerDraft: false };

    it('доступна, когда работа правится и текст уже подставлен', () => {
      expect(canSaveDraft(base)).toBe(true);
    });

    it('недоступна, пока сохранённый ответ не подставлен — иначе пустое поле затрёт его', () => {
      expect(canSaveDraft({ ...base, awaitingServerDraft: true })).toBe(false);
    });

    it('недоступна во время сохранения', () => {
      expect(canSaveDraft({ ...base, saving: true })).toBe(false);
    });

    it('недоступна, когда работа больше не правится', () => {
      expect(canSaveDraft({ ...base, editable: false })).toBe(false);
    });
  });
});
