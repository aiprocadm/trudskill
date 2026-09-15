import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { skipString, stripComments } from './backend-source';

/**
 * Запрос к серверу несёт подпись вошедшего (ТЗ «Стабилизация, UX и развитие», 2.3 / Б5).
 *
 * **Как было.** Токен обязан был передать КАЖДЫЙ вызывающий, руками. Двадцать два вызова в
 * пяти разделах этого не делали — «Обмен данными», «Оплата», «Оповещения по СМС», «Вебинары»,
 * «Видео в курсах». Сервер честно отвечал `auth_required`, и человек читал «Вход не выполнен
 * или срок сессии истёк», сидя в системе, со своим именем в шапке. На «Обмене данными» таких
 * запросов три подряд — отсюда три одинаковых красных сообщения и три одинаковых всплывашки.
 *
 * Хуже того, восстановление сессии по 401 такие запросы не спасало: оно включалось только там,
 * где токен ПЕРЕДАЛИ, то есть ровно там, где он и так был.
 *
 * **Что закреплено.** Подпись берётся из сессии сама, а обратное — редкое исключение, которое
 * называется вслух: `anonymous: true`. Сторож следит за двумя вещами:
 *
 * 1. Шов на месте: клиент спрашивает подпись у слоя сессии, а слой сессии её ставит. Уберут
 *    любую половину — двадцать два вызова снова молча пойдут без подписи, и ни один тест,
 *    кроме этого, не покраснеет.
 * 2. Список «заведомо без подписи» держится храповиком: он сверяется на РАВЕНСТВО, поэтому
 *    новый `anonymous: true` не проскочит незамеченным, а исчезнувший придётся убрать отсюда.
 *
 * Почему проверка по тексту исходника: React Testing Library в наборе нет (CLAUDE.md), а шов
 * здесь — глобальная точка, которую нельзя увидеть изнутри одного модуля.
 */

const CLIENT = fromApp('src', 'lib', 'api', 'client.ts');
const SESSION_MANAGER = fromApp('src', 'lib', 'auth', 'session-manager.ts');

/**
 * Единственные места, которым подпись вошедшего не нужна, — с причиной у каждого.
 *
 * Храповик: список сверяется на равенство. Появился новый «аноним» — либо он настоящий и его
 * вписывают сюда с причиной, либо это и есть возвращённый дефект Б5.
 */
const ANONYMOUS_BY_DESIGN: Record<string, string> = {
  'src/lib/auth/auth-api.ts':
    'вход подтверждается кодом — сессии ещё нет, подписывать запрос нечем',
  'src/lib/tenant/current-tenant.ts':
    'публичная ручка: её зовут ДО входа, чтобы понять, в какой центр человек стучится'
};

const sourcesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourcesUnder(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (entry.includes('.test.')) continue;
    out.push(full);
  }
  return out;
};

/** Индекс закрывающей скобки вызова, начатого открывающей в `open`; строки не путают счёт. */
const matchParen = (code: string, open: number): number => {
  let depth = 0;
  let index = open;
  while (index < code.length) {
    const char = code[index]!;
    if (char === "'" || char === '"' || char === '`') {
      index = skipString(code, index) + 1;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
};

const CALL =
  /\b(apiRequest|apiRequestEnvelope|apiClient\.(?:get|post|put|patch|delete))\s*(?:<[^(]*?>)?\s*\(/g;

const anonymousCallers = (): string[] => {
  const root = fromApp('src');
  const found = new Set<string>();
  for (const file of sourcesUnder(root)) {
    /* Сам клиент не считается: там `anonymous` объявляется и читается, а не применяется. */
    if (file === CLIENT) continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    CALL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CALL.exec(code)) !== null) {
      const open = code.indexOf('(', match.index + match[1]!.length);
      const close = matchParen(code, open);
      if (close === -1) continue;
      if (/\banonymous\s*:\s*true\b/.test(code.slice(open + 1, close))) {
        found.add(file.slice(fromApp().length + 1).replace(/\\/g, '/'));
      }
      CALL.lastIndex = close;
    }
  }
  return [...found].sort();
};

describe('запрос к серверу несёт подпись вошедшего (ТЗ 2.3)', () => {
  it('клиент спрашивает подпись у слоя сессии, когда вызывающий её не задал', () => {
    const code = stripComments(readFileSync(CLIENT, 'utf8'));

    expect(
      /export const setSessionAuth\b/.test(code),
      'у клиента обязан быть шов для подписи вошедшего — иначе токен снова станет обязанностью ' +
        'каждого вызывающего, а забыть его слишком легко (дефект Б5)'
    ).toBe(true);

    /* Подпись берётся из сессии ИМЕННО когда своя не задана — и никогда поверх заданной. */
    expect(
      /options\.auth\s*\?\?\s*sessionAuth\s*\?\.\(\)/.test(code),
      'заданную вызывающим подпись перетирать нельзя: так ходят ручки двухфакторного входа'
    ).toBe(true);

    /* Повтор по 401 должен смотреть на ТУ подпись, что реально ушла, а не на переданную. */
    expect(
      /response\.status === 401 && auth\?\.accessToken/.test(code),
      'восстановление сессии обязано включаться по фактической подписи запроса — раньше оно ' +
        'работало только там, где токен и так передали'
    ).toBe(true);
  });

  it('слой сессии эту подпись действительно ставит — вместе с центром', () => {
    const code = stripComments(readFileSync(SESSION_MANAGER, 'utf8'));

    expect(
      /setSessionAuth\s*\(/.test(code),
      'шов без поставщика мёртв: клиент спросит и получит «не вошёл»'
    ).toBe(true);

    /*
     * Центр обязателен вместе с токеном. Охрана сверяет центр из токена с заголовком запроса;
     * подпись без центра дала бы отказ по несовпадению — то же «вход не выполнен», только по
     * другой причине, и искать её пришлось бы заново.
     */
    const registration = code.slice(code.indexOf('setSessionAuth('));
    expect(registration).toContain('accessToken');
    expect(
      registration.includes('tenantId'),
      'без центра подпись неполна: заголовок запроса уедет на центр по умолчанию'
    ).toBe(true);
  });

  it('заведомо неподписанные запросы наперечёт и объяснены', () => {
    expect(
      anonymousCallers(),
      'список сверяется на РАВЕНСТВО: новый «аноним» — это либо настоящее исключение (тогда ' +
        'впишите его в ANONYMOUS_BY_DESIGN с причиной), либо вернувшийся дефект Б5'
    ).toEqual(Object.keys(ANONYMOUS_BY_DESIGN).sort());
  });

  it('у каждого исключения написана причина, а не просто отметка', () => {
    for (const [file, reason] of Object.entries(ANONYMOUS_BY_DESIGN)) {
      expect(reason.length, `${file}: причина обязана быть человеческой фразой`).toBeGreaterThan(
        20
      );
    }
  });
});
