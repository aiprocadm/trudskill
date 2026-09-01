import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Каждое поле публичного ответа проверки документа кто-то заполняет.
 *
 * Страница `/verify/:token` — единственное место продукта, куда смотрит ПОСТОРОННИЙ: инспектор
 * с телефоном, проверяющий удостоверение по QR. Поле, объявленное в ответе и никем не
 * заполняемое, здесь стоит дороже обычного: страница молча не отвечает на вопрос, ради
 * которого её открыли, и выглядит при этом исправной.
 *
 * Так и было (журнал 322): `programTitle` и `academicHours` объявлены в `PublicVerifyResult`,
 * отрисованы на странице — и не присваивались НИКЕМ. Инспектор видел номер, дату, имя и центр,
 * но не видел, по какой программе и на сколько часов обучен человек, — а для удостоверения
 * по охране труда это и есть содержание документа.
 *
 * Проверка узкая намеренно: только этот ответ. Общий инвентарь «поле объявлено — кто заполняет»
 * по всем типам фронта дал 14 кандидатов, из которых 13 оказались ложными (поле собирается
 * на фронте, присваивается сокращённой записью, приходит из другого пакета). Сторож на такой
 * основе был бы шумом; здесь же список полей короткий и каждое на виду у постороннего.
 *
 * Проверено подсадным нарушителем: снятие присваивания роняет тест и называет поле.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const UTIL = resolve(HERE, 'public-verify.util.ts');
const CONTROLLER = resolve(HERE, 'public-verify.controller.ts');

/**
 * Поля, которые ответ объявляет, но заполнять не обязан, — с ответом почему.
 * Реестр решений, а не способ погасить красный тест.
 */
const OPTIONAL_BY_DESIGN: ReadonlyArray<{ field: string; why: string }> = [];

const declaredFields = (): string[] => {
  const source = readFileSync(UTIL, 'utf8');
  const start = source.indexOf('export interface PublicVerifyResult {');
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9]*)\??:/gm)]
    .map((m) => m[1] as string)
    .filter((field) => field !== 'status');
};

const assignedFields = (): Set<string> => {
  const text = [UTIL, CONTROLLER].map((file) => readFileSync(file, 'utf8')).join('\n');
  const assigned = new Set<string>();
  for (const m of text.matchAll(/result\.([a-zA-Z][A-Za-z0-9]*)\s*=/g)) {
    if (m[1]) assigned.add(m[1]);
  }
  // Поля, заданные прямо в литерале результата (`status`, `documentId`, `documentType`).
  for (const m of text.matchAll(/^\s{4}([a-zA-Z][A-Za-z0-9]*):\s/gm)) {
    if (m[1]) assigned.add(m[1]);
  }
  return assigned;
};

describe('публичная проверка документа: объявленное поле кто-то заполняет', () => {
  it('у каждого поля ответа есть присваивание', () => {
    const assigned = assignedFields();
    const explained = new Set(OPTIONAL_BY_DESIGN.map((item) => item.field));

    const never = declaredFields().filter((field) => !assigned.has(field) && !explained.has(field));

    expect(
      never,
      'Поле объявлено в публичном ответе проверки, но его не заполняет никто. Инспектор, ' +
        'сканирующий QR, не получит ответа, а страница будет выглядеть исправной. Либо ' +
        'заполните поле, либо уберите его из ответа, либо внесите в OPTIONAL_BY_DESIGN ' +
        'с объяснением, почему пустое значение здесь нормально.'
    ).toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустой список полей сделал бы проверку зелёной ни на чём.
    expect(declaredFields().length).toBeGreaterThan(8);
    expect(assignedFields().size).toBeGreaterThan(8);
  });
});
