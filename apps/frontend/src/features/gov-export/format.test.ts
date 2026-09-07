import { describe, expect, it } from 'vitest';

import { exportedOn } from './format';

/**
 * §5.432: кто собрал выгрузку в государственный реестр — видно человеку.
 *
 * При проверке спрашивают, кто отправил выгрузку. Сервер хранил автора и присылал его экрану,
 * а экран не показывал вовсе — ответ был только в базе.
 */
describe('когда собрана выгрузка и кем', () => {
  it('называет дату и человека одной строкой', () => {
    const line = exportedOn({
      createdAt: '2026-08-25T10:00:00.000Z',
      generatedBy: 'u1',
      generatedByName: 'Иванов И.'
    });

    expect(line).toContain('Иванов И.');
    expect(line).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    // Сырой идентификатор человеку не показывается (правило продукта №2).
    expect(line).not.toContain('u1');
  });

  it('удалённая учётная запись названа прямо, а не «системой»', () => {
    const line = exportedOn({
      createdAt: '2026-08-25T10:00:00.000Z',
      generatedBy: 'u_gone',
      generatedByName: null
    });

    expect(line).toContain('учётная запись удалена');
    expect(line).not.toContain('система');
  });

  it('без автора показывает только дату, ничего не выдумывая', () => {
    const line = exportedOn({ createdAt: '2026-08-25T10:00:00.000Z' });

    expect(line).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });
});
