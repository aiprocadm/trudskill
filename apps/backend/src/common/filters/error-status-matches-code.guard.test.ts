import { describe, expect, it } from 'vitest';

import { errorThrows } from '../testing/error-throw-inventory.test-util.js';

/**
 * Статус ответа отвечает коду ошибки.
 *
 * Зачем это инвариант, а не вкусовщина. Словарь фронта (`lib/errors/error-text.ts`) отвечает
 * человеку по коду, а коду без своей статьи — по СТАТУСУ. Со §5.422 это записано решением:
 * 51 код оставлен на запасной текст именно потому, что статус несёт их смысл («404 — записи
 * нет», «409 — занято», «401 — сессия негодна»). Решение верно ровно до тех пор, пока статус
 * и код говорят одно и то же.
 *
 * Никто этого не сверял, и разошлось в шести местах. Самое заметное: `template_not_found`
 * возвращался как 404 в трёх местах и как 400 — в четвёртом; в четвёртом человек читал
 * «Данные в форме не подходят. Проверьте заполненные поля» вместо «Запись не найдена».
 * Рядом: `auth_required` отдавался со статусом 403 (проверяющий права), хотя сам код говорит
 * «войдите заново»; `conflict` — со статусом 400.
 *
 * Два инварианта:
 *  1. Один код — один статус. Одно и то же не может быть двумя разными видами отказа.
 *  2. Имя кода не противоречит статусу: `*_not_found` отвечает 404, `already_*` и `*_taken` —
 *     409. Это не полная классификация, а те две формы имени, которые говорят сами за себя.
 */

/**
 * Общие коды-корзины: один код на много разных случаев, и статус у каждого свой.
 *
 * Это не поблажка, а другая роль: `domain_rule_violation` не называет случай, он называет
 * РОД случая — «мешает состояние записи». Такому коду статус и не должен быть один.
 */
const BUCKET_CODES: Record<string, string> = {
  domain_rule_violation:
    'род случая, а не случай: 400 у правил жизненного цикла, 412 у непройденного шага',
  validation_error: 'род случая: тело запроса не подошло — и в форме, и в файле, и в параметре',
  not_found: 'род случая: запись не найдена — статус берётся по месту вызова',
  forbidden: 'род случая: доступ закрыт — 403 у прав, 401 у отсутствующей сессии'
};

/**
 * Коды, у которых статус расходится с именем ПО ПРИЧИНЕ.
 *
 * Причина обязана объяснять, почему здесь смысл другой, а не почему менять неудобно.
 */
const NAME_EXCEPTIONS: Record<string, string> = {
  tenant_not_found:
    'на входе (`tenant-access.service`) это не «записи нет», а «сессию не выдаём» — 401; ' +
    'в остальных шести местах код значит ровно «нет записи» и отвечает 404',
  plan_feature_unavailable:
    'слово «недоступно» здесь не про сбой сервиса, а про тариф: возможность закрыта, ' +
    'а не сломана — 403',
  document_file_missing:
    'запись документа есть, файла у неё ещё нет — это 404 на файл, а не на документ'
};

/** Имя кода говорит «записи нет». */
const SAYS_NOT_FOUND = /(^|_)not_found$/;
/** Имя кода говорит «уже есть / занято». */
const SAYS_TAKEN = /_taken$|_conflict$|^already_|_duplicate$|_exists$/;

const throws = errorThrows();

/** Код → статусы, с которыми он бросается, и места. */
const byCode = new Map<string, Map<number, string[]>>();
for (const item of throws) {
  if (item.status === null) continue;
  for (const code of item.codes) {
    const statuses = byCode.get(code) ?? new Map<number, string[]>();
    statuses.set(item.status, [...(statuses.get(item.status) ?? []), item.location]);
    byCode.set(code, statuses);
  }
}

const describeSpread = (code: string, statuses: Map<number, string[]>): string =>
  `${code}: ` +
  [...statuses.entries()]
    .map(([status, places]) => `${status} (${places.length}× ${places[0]})`)
    .join('  |  ');

describe('статус ответа отвечает коду ошибки', () => {
  it('сторож видит броски, а не пустой список', () => {
    expect(throws.filter((t) => t.codes.length).length).toBeGreaterThanOrEqual(300);
  });

  it('у каждого броска выведен статус — новая форма не проходит молча', () => {
    const unknown = throws
      .filter((t) => t.codes.length && t.status === null)
      .map((t) => `${t.location} [${t.exception}] — статус не выведен`);
    expect(unknown).toEqual([]);
  });

  it('один код — один статус', () => {
    const spread = [...byCode.entries()]
      .filter(([code]) => !(code in BUCKET_CODES) && !(code in NAME_EXCEPTIONS))
      .filter(([, statuses]) => statuses.size > 1)
      .map(([code, statuses]) => describeSpread(code, statuses));
    expect(spread, `кодов с двумя статусами: ${spread.length}`).toEqual([]);
  });

  it('«не найдено» отвечает 404', () => {
    const wrong = [...byCode.entries()]
      .filter(([code]) => SAYS_NOT_FOUND.test(code) && !(code in NAME_EXCEPTIONS))
      .flatMap(([code, statuses]) =>
        [...statuses.entries()]
          .filter(([status]) => status !== 404)
          .flatMap(([status, places]) => places.map((at) => `${code} [${status}] ${at}`))
      );
    expect(wrong).toEqual([]);
  });

  it('«уже есть / занято» отвечает 409', () => {
    const wrong = [...byCode.entries()]
      .filter(([code]) => SAYS_TAKEN.test(code) && !(code in NAME_EXCEPTIONS))
      .flatMap(([code, statuses]) =>
        [...statuses.entries()]
          .filter(([status]) => status !== 409)
          .flatMap(([status, places]) => places.map((at) => `${code} [${status}] ${at}`))
      );
    expect(wrong).toEqual([]);
  });

  it('списки не протухают — записанный код всё ещё бросается', () => {
    const gone = [...Object.keys(BUCKET_CODES), ...Object.keys(NAME_EXCEPTIONS)]
      .filter((code) => !byCode.has(code))
      .map((code) => `${code} — записан в стороже, но бэкенд его больше не бросает`);
    expect(gone).toEqual([]);
  });
});
