import { describe, expect, it } from 'vitest';

import { type ConnectionInput, resolveConnectionStatus } from './connection';

const input = (over: Partial<ConnectionInput> = {}): ConnectionInput => ({
  online: true,
  unsavedCount: 0,
  saving: false,
  lastError: null,
  ...over
});

describe('resolveConnectionStatus (ФТ-H5, Фаза 5 Task 3)', () => {
  it('всё сохранено и сеть есть — спокойное состояние', () => {
    const status = resolveConnectionStatus(input());
    expect(status.level).toBe('ok');
    expect(status.hasUnsaved).toBe(false);
  });

  it('нет сети и есть несохранённое — самое опасное состояние, с числом ответов', () => {
    const status = resolveConnectionStatus(input({ online: false, unsavedCount: 3 }));
    expect(status.level).toBe('danger');
    expect(status.message).toContain('3');
    expect(status.hasUnsaved).toBe(true);
  });

  it('нет сети, но терять нечего — предупреждение, а не тревога', () => {
    // Пугать человека посреди экзамена, когда всё уже сохранено, вредно: он бросит
    // отвечать и пойдёт чинить интернет.
    const status = resolveConnectionStatus(input({ online: false }));
    expect(status.level).toBe('warning');
    expect(status.message).toContain('сохранено');
  });

  it('отсутствие сети важнее неудачи сохранения', () => {
    // Иначе человек прочтёт «ошибка сервера» и решит, что дело в системе, а не в связи.
    const status = resolveConnectionStatus(
      input({ online: false, unsavedCount: 1, lastError: 'сервер недоступен' })
    );
    expect(status.level).toBe('danger');
    expect(status.message).toContain('Нет связи');
  });

  it('неудача сохранения при живой сети называет причину', () => {
    const status = resolveConnectionStatus(input({ unsavedCount: 1, lastError: 'сервер 500' }));
    expect(status.level).toBe('danger');
    expect(status.message).toContain('сервер 500');
  });

  it('прошлая ошибка при сохранённых ответах не показывается', () => {
    // «Была ошибка» рядом с «всё сохранено» только путает: ответ в итоге дошёл.
    const status = resolveConnectionStatus(input({ lastError: 'сервер 500' }));
    expect(status.level).toBe('ok');
  });

  it('идущее сохранение видно', () => {
    const status = resolveConnectionStatus(input({ saving: true, unsavedCount: 1 }));
    expect(status.level).toBe('saving');
  });

  it('несохранённое без ошибки — предупреждение', () => {
    const status = resolveConnectionStatus(input({ unsavedCount: 2 }));
    expect(status.level).toBe('warning');
    expect(status.hasUnsaved).toBe(true);
  });

  it('признак несохранённого совпадает со счётчиком при любых сочетаниях', () => {
    // Этим же признаком включается предупреждение при уходе со страницы: разъедься
    // они — и вкладка закрывалась бы молча с потерянным ответом.
    for (const online of [true, false]) {
      for (const saving of [true, false]) {
        for (const lastError of [null, 'ошибка']) {
          for (const unsavedCount of [0, 1, 5]) {
            const status = resolveConnectionStatus({ online, saving, lastError, unsavedCount });
            expect(status.hasUnsaved).toBe(unsavedCount > 0);
          }
        }
      }
    }
  });
});
