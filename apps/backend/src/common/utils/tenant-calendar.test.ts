import { describe, expect, it } from 'vitest';

import { DEFAULT_TENANT_TIMEZONE, periodKeyIn, todayIn } from './tenant-calendar.js';

/**
 * Календарь центра (журнал 300).
 *
 * Проверяется не «работает ли Intl», а ровно тот случай, из-за которого класс заведён:
 * у центра за Уралом ночь и раннее утро приходятся на ПРЕДЫДУЩИЕ сутки по UTC, и документ
 * получал вчерашнюю дату и номер из закрытого года.
 */

describe('календарь центра: «сегодня» в его часовом поясе', () => {
  it('Новосибирск: 1 января 06:00 по местному — это 1 января, а не 31 декабря', () => {
    // 2026-12-31T23:00:00Z = 2027-01-01T06:00 в Новосибирске (UTC+7).
    const at = new Date('2026-12-31T23:00:00.000Z');

    expect(todayIn('Asia/Novosibirsk', at)).toBe('2027-01-01');
    // А по UTC — вчерашняя дата прошлого года: ровно то, что печаталось на удостоверении.
    expect(at.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('Москва: 02:00 по местному — уже наступившие сутки, а не вчерашние', () => {
    // 2026-05-31T23:00:00Z = 2026-06-01T02:00 в Москве (UTC+3).
    const at = new Date('2026-05-31T23:00:00.000Z');

    expect(todayIn('Europe/Moscow', at)).toBe('2026-06-01');
    expect(todayIn(undefined, at)).toBe('2026-06-01');
  });

  it('Калининград (UTC+2) и Камчатка (UTC+12) считаются каждый по-своему', () => {
    const at = new Date('2026-07-15T22:30:00.000Z');

    expect(todayIn('Europe/Kaliningrad', at)).toBe('2026-07-16');
    expect(todayIn('Asia/Kamchatka', at)).toBe('2026-07-16');
    expect(todayIn('Europe/Moscow', at)).toBe('2026-07-16');
    // Днём разница не видна — потому дефект и жил незамеченным.
    const noon = new Date('2026-07-15T09:00:00.000Z');
    expect(todayIn('Europe/Kaliningrad', noon)).toBe('2026-07-15');
    expect(todayIn('Asia/Kamchatka', noon)).toBe('2026-07-15');
  });

  it('неизвестный пояс не роняет выпуск документа — считаем по умолчанию', () => {
    const at = new Date('2026-05-31T23:00:00.000Z');

    expect(todayIn('Не/Пояс', at)).toBe(todayIn(DEFAULT_TENANT_TIMEZONE, at));
    expect(todayIn('', at)).toBe(todayIn(DEFAULT_TENANT_TIMEZONE, at));
  });
});

describe('календарь центра: период номера', () => {
  it('Новосибирск: 1 января 06:00 по местному — серия НОВОГО года', () => {
    const at = new Date('2026-12-31T23:00:00.000Z');

    expect(periodKeyIn('Asia/Novosibirsk', 'year', at)).toBe('2027');
    expect(periodKeyIn('Asia/Novosibirsk', 'month', at)).toBe('2027-01');
    // По UTC это была бы серия закрытого года — номер «из прошлого».
    expect(periodKeyIn('UTC', 'year', at)).toBe('2026');
  });

  it('без сброса период один на всё время', () => {
    expect(periodKeyIn('Asia/Novosibirsk', 'none', new Date('2026-12-31T23:00:00.000Z'))).toBe(
      'all'
    );
  });

  it('месяц печатается с ведущим нулём — маска номера не должна плясать', () => {
    expect(periodKeyIn('Europe/Moscow', 'month', new Date('2026-03-10T12:00:00.000Z'))).toBe(
      '2026-03'
    );
  });
});
