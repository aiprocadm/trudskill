import { describe, expect, it } from 'vitest';

import { UNSAVED_ANSWER_SUBMIT_MESSAGE, shouldBlockSubmit } from './submit-guard';

/*
 * Ревизия 2026-08-27 (порция 27, журнал 280): «Завершить тест» игнорировал неудачу
 * сохранения последнего ответа — попытка финализировалась на сервере без него, а человек
 * видел «Тест завершён» и не знал, что ответ не дошёл.
 */
describe('сдача теста не теряет последний ответ (порция 27)', () => {
  it('сдача по кнопке останавливается, если последний ответ не сохранился', () => {
    expect(shouldBlockSubmit({ auto: false, currentAnswerUnsaved: true })).toBe(true);
  });

  it('сдача по кнопке идёт, когда всё сохранено', () => {
    expect(shouldBlockSubmit({ auto: false, currentAnswerUnsaved: false })).toBe(false);
  });

  it('автосдача по нулю таймера идёт всегда: несданная попытка всё равно закроется', () => {
    expect(shouldBlockSubmit({ auto: true, currentAnswerUnsaved: true })).toBe(false);
  });

  it('сообщение объясняет, что произошло и что делать', () => {
    expect(UNSAVED_ANSWER_SUBMIT_MESSAGE).toMatch(/не сохранил/i);
    expect(UNSAVED_ANSWER_SUBMIT_MESSAGE).toMatch(/связь/i);
  });
});
