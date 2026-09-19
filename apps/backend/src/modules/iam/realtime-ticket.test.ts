import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  REALTIME_TICKET_TTL_SECONDS,
  newRealtimeTicket,
  parseRealtimeTicket,
  realtimeTicketKey,
  ticketMatchesRoom
} from './realtime-ticket.js';

/**
 * Одноразовый тикет вместо токена доступа в адресе (ТЗ «Стабилизация, UX и развитие», 9.1).
 *
 * **Что было.** Браузер подключался к живой трансляции так:
 * `/realtime/stream/user%3Au_tenant_admin?since=...&access_token=eyJhbGci...` — ПОЛНОЦЕННЫЙ
 * токен доступа ехал в адресе запроса.
 *
 * Почему это опасно: адрес запроса не секрет. Он попадает в журналы веб-сервера, в историю
 * браузера и в заголовок `Referer`, который браузер отправляет НА ЧУЖИЕ САЙТЫ при переходе по
 * внешней ссылке. Токен оттуда можно взять и работать от имени человека всё время, пока токен
 * жив — а это часы (журнал 571).
 *
 * **Что закреплено.** В адрес уходит тикет: случайная строка, живущая секунды и сгорающая при
 * первом использовании. Украсть её из журнала можно, воспользоваться — уже нет.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe('тикет нельзя угадать и нельзя переиспользовать (ТЗ 9.1)', () => {
  it('тикеты не повторяются', () => {
    /* Совпавший тикет означал бы, что чужое подключение можно перехватить угадыванием. */
    const seen = new Set(Array.from({ length: 200 }, () => newRealtimeTicket()));
    expect(seen.size).toBe(200);
  });

  it('тикет достаточно длинный, чтобы его не перебрали', () => {
    /* 32 байта случайности — столько же, сколько у ключей сессий; в шестнадцатеричном виде 64 знака. */
    expect(newRealtimeTicket()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('живёт секунды, а не часы', () => {
    /*
     * Смысл тикета в том, что найденная в журнале строка бесполезна. Срок в минутах это бы
     * обесценил: журнал читают и в ту же минуту.
     */
    expect(REALTIME_TICKET_TTL_SECONDS).toBeLessThanOrEqual(60);
    expect(REALTIME_TICKET_TTL_SECONDS, 'слишком мало для медленной сети').toBeGreaterThanOrEqual(
      10
    );
  });

  it('ключ хранилища опознаваем', () => {
    expect(realtimeTicketKey('abc')).toBe('realtime:ticket:abc');
  });
});

describe('тикет действует только на свою комнату (ТЗ 9.1)', () => {
  const payload = {
    tenantId: 't1',
    userId: 'u1',
    sessionId: 's1',
    roles: ['tenant_admin'],
    room: 'user:u1'
  };

  it('своя комната — годится', () => {
    expect(ticketMatchesRoom(payload, 'user:u1')).toBe(true);
  });

  it('чужая комната — нет', () => {
    /*
     * Иначе достаточно было бы попросить тикет на свой канал и подключиться к чужому. Проверка
     * прав на комнату остаётся сверх этого: она отвечает на другой вопрос — «положено ли сюда
     * этому человеку», а не «про эту ли комнату тикет».
     */
    expect(ticketMatchesRoom(payload, 'user:u2')).toBe(false);
    expect(ticketMatchesRoom(payload, 'tenant:t1')).toBe(false);
  });
});

describe('разбор тикета не доверяет содержимому хранилища (ТЗ 9.1)', () => {
  it('целое значение разбирается', () => {
    const raw = JSON.stringify({
      tenantId: 't1',
      userId: 'u1',
      sessionId: 's1',
      roles: ['teacher'],
      room: 'user:u1'
    });
    expect(parseRealtimeTicket(raw)).toEqual({
      tenantId: 't1',
      userId: 'u1',
      sessionId: 's1',
      roles: ['teacher'],
      room: 'user:u1'
    });
  });

  it('пусто, мусор и обрывки — отказ, а не исключение', () => {
    /*
     * Пусто приходит в самом частом случае: тикет уже использован или истёк. Это не сбой, а
     * обычный ответ «подключение отклонено», и падать здесь нельзя.
     */
    expect(parseRealtimeTicket(null)).toBeNull();
    expect(parseRealtimeTicket('')).toBeNull();
    expect(parseRealtimeTicket('не-json')).toBeNull();
    expect(parseRealtimeTicket('123')).toBeNull();
    expect(parseRealtimeTicket('{"tenantId":"t1"}'), 'нет остальных полей').toBeNull();
  });

  it.each(['tenantId', 'userId', 'sessionId', 'room'])(
    'без поля «%s» тикет отклоняется',
    (missing) => {
      /*
       * Каждое из этих полей отвечает на вопрос доступа. Без названия центра подключение
       * прошло бы «ничьим» — а это уже утечка между центрами, самый тяжёлый класс дефекта в
       * этой системе. Проверяем поля поимённо: общая проверка «чего-то не хватает» прошла бы
       * мимо, если отвалится ровно одно.
       */
      const whole: Record<string, unknown> = {
        tenantId: 't1',
        userId: 'u1',
        sessionId: 's1',
        roles: [],
        room: 'user:u1'
      };
      delete whole[missing];
      expect(parseRealtimeTicket(JSON.stringify(whole))).toBeNull();
    }
  );

  it('роли непонятного вида не ломают разбор, а отбрасываются', () => {
    /* Роль — это то, что определяет доступ. Взять её «как есть» из хранилища нельзя. */
    const raw = JSON.stringify({
      tenantId: 't1',
      userId: 'u1',
      sessionId: 's1',
      roles: ['teacher', 42, null, { admin: true }],
      room: 'user:u1'
    });
    expect(parseRealtimeTicket(raw)?.roles).toEqual(['teacher']);
  });

  it('отсутствие ролей — это пустой список, а не «все роли»', () => {
    const raw = JSON.stringify({
      tenantId: 't1',
      userId: 'u1',
      sessionId: 's1',
      room: 'user:u1'
    });
    expect(parseRealtimeTicket(raw)?.roles).toEqual([]);
  });
});

describe('две копии разбора не разошлись (ТЗ 9.1)', () => {
  /*
   * Служба трансляций намеренно не зависит от пакетов приложения — она поднимается отдельно и
   * держит минимум зависимостей. По тому же основанию там лежит копия каталога событий, и её
   * расхождение с каноном тоже стережёт тест. Здесь сверяются ключ хранилища и разбор: если
   * бэкенд начнёт писать под другим ключом или в другом виде, подключения молча перестанут
   * работать — а молча тут самое неприятное, потому что живые обновления не обязательны и их
   * пропажу замечают не сразу.
   */
  const realtimeSource = readFileSync(
    resolve(here, '..', '..', '..', '..', 'realtime', 'src', 'ticket.ts'),
    'utf8'
  );

  it('ключ хранилища совпадает', () => {
    expect(realtimeSource).toContain('`realtime:ticket:${ticket}`');
  });

  it('обязательные поля те же', () => {
    for (const field of ['tenantId', 'userId', 'sessionId', 'room']) {
      expect(realtimeSource, `поле ${field} не проверяется на стороне трансляций`).toContain(
        `typeof ${field} !== 'string'`
      );
    }
  });

  it('роли так же отфильтровываются по виду', () => {
    expect(realtimeSource).toMatch(/roles\.filter\(\(role\): role is string/);
  });
});

describe('токен доступа в адрес больше не уходит (ТЗ 9.1)', () => {
  const realtimeModule = readFileSync(
    resolve(here, '..', '..', '..', '..', 'realtime', 'src', 'app.module.ts'),
    'utf8'
  );
  const client = readFileSync(
    resolve(here, '..', '..', '..', '..', 'frontend', 'src', 'lib', 'realtime', 'client.ts'),
    'utf8'
  );

  it('служба трансляций не читает токен из адреса', () => {
    /*
     * Ищем ПОСТРОЙКУ «взять из запроса параметр», а не слово: упоминание в комментарии ничего
     * не доказывает, а на этой грабле сторожа спотыкались уже пять раз.
     */
    expect(realtimeModule, 'токен снова принимается параметром адреса').not.toMatch(
      /@Query\('access_token'\)/
    );
    expect(realtimeModule).toMatch(/@Query\('ticket'\)/);
  });

  it('тикет забирается ОДНИМ действием — прочитать и удалить', () => {
    /*
     * Разделить на «прочитать» и «удалить» нельзя: между двумя запросами успевает вклиниться
     * второй желающий, и одноразовость превращается в обещание.
     */
    const store = readFileSync(
      resolve(here, '..', '..', '..', '..', 'realtime', 'src', 'realtime-backend.ts'),
      'utf8'
    );
    expect(store).toMatch(/client\.getDel\(key\)/);
  });

  it('браузер кладёт в адрес тикет, а не токен', () => {
    expect(client, 'токен доступа снова уходит в адрес').not.toMatch(
      /searchParams\.set\('access_token'/
    );
    expect(client).toMatch(/searchParams\.set\('ticket', ticket\)/);
  });
});
