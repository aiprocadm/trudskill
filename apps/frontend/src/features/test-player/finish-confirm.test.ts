import { describe, expect, it } from 'vitest';

import { finishTestRequest } from './finish-confirm';

/** Подтверждение завершения теста по кнопке (ТЗ 5.3 / Э3). */
describe('finishTestRequest', () => {
  it('называет число вопросов без ответа и последствие', () => {
    const request = finishTestRequest({ unanswered: 3, total: 10 });
    expect(request.message).toMatch(/Без ответа: 3 из 10/);
    expect(request.message).toMatch(/не получится/);
    expect(request.confirmLabel).toBe('Завершить тест');
    expect(request.cancelLabel).toBe('Вернуться к вопросам');
  });

  it('все ответы даны — говорит об этом, без пугающего тона и без ввода', () => {
    const request = finishTestRequest({ unanswered: 0, total: 10 });
    expect(request.message).toMatch(/Все 10 ответов/);
    expect(request.tone).toBeUndefined();
    expect(request.requireTyping).toBeUndefined();
  });
});
