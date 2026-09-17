import { describe, expect, it } from 'vitest';

import { statusChangeRequest } from './status-confirm';

const tenant = { name: 'Ромб', code: 'romb' };

/** Подтверждение смены статуса центра (ТЗ 5.3 / Э3). */
describe('statusChangeRequest', () => {
  it('приостановка называет центр и последствие, кнопка опасная, ввода не требует', () => {
    const request = statusChangeRequest(tenant, 'suspended');
    expect(request.title).toBe('Приостановить центр');
    expect(request.message).toContain('«Ромб»');
    expect(request.message).toMatch(/не смогут войти/);
    expect(request.tone).toBe('danger');
    expect(request.requireTyping).toBeUndefined();
    expect(request.confirmLabel, 'кнопка называет результат (TXT-002)').toBe('Приостановить центр');
  });

  it('архив — самое тяжёлое: ввод кода центра, как в отзыве лицензии', () => {
    const request = statusChangeRequest(tenant, 'archived');
    expect(request.message).toContain('«Ромб»');
    expect(request.message).toMatch(/вход закроется/);
    expect(request.tone).toBe('danger');
    expect(request.requireTyping?.word).toBe('romb');
    expect(request.requireTyping?.label).toMatch(/код центра/);
  });

  it('включение и пробный период — конструктивные: без опасного тона и без ввода', () => {
    for (const status of ['active', 'trial'] as const) {
      const request = statusChangeRequest(tenant, status);
      expect(request.tone).toBeUndefined();
      expect(request.requireTyping).toBeUndefined();
      expect(request.message).toContain('«Ромб»');
    }
  });
});
