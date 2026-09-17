import { describe, expect, it } from 'vitest';

import { closeGroupRequest } from './confirm';

/** Подтверждение закрытия группы (ТЗ 5.3 / Э3). */
describe('closeGroupRequest', () => {
  it('называет группу, последствие и требует ввести её название', () => {
    const request = closeGroupRequest({
      groupName: 'Группа 360px',
      learnersCount: 12,
      mode: 'close'
    });
    expect(request.title).toBe('Закрыть группу «Группа 360px»?');
    expect(request.message).toMatch(/12 чел\./);
    expect(request.message).toMatch(/изменить будет нельзя/);
    expect(request.tone).toBe('danger');
    expect(request.confirmLabel, 'кнопка называет результат и не меняется по ходу').toBe(
      'Закрыть группу'
    );
    expect(request.requireTyping?.word).toBe('Группа 360px');
  });

  it('цепочка: сервер сам отбирает сдавших — так и сказано', () => {
    const request = closeGroupRequest({ groupName: 'ОТ-14', learnersCount: 0, mode: 'chain' });
    expect(request.message).toMatch(/каждому сдавшему/);
    expect(request.message).toMatch(/отберёт сервер/);
    expect(request.requireTyping?.word).toBe('ОТ-14');
  });
});
