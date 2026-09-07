import { describe, expect, it } from 'vitest';

import { CODE_SHAPE, errorThrows } from '../testing/error-throw-inventory.test-util.js';

/**
 * Ошибка доносит до человека СВОЙ смысл, а не «сбой сервера».
 *
 * Конверт ответа обещает код: `HttpExceptionErrorBody.code: string`
 * (`packages/api-contracts/src/http/contracts.ts`). CLAUDE.md повторяет это правилом для
 * бэкенда: исключение бросается объектной формой `{ code, message }`. Исполняет обещание
 * тот, кто бросает: `HttpExceptionEnvelopeFilter` кладёт в конверт то, что дал ему Nest.
 *
 * А Nest на строковую форму — `new BadRequestException('Only draft application can be
 * updated')` — отдаёт `{ message, error: 'Bad Request', statusCode: 400 }`. Кода там нет.
 * Фронт, не найдя кода, до ревизии 2026-09-06 подставлял `internal_error`
 * (`lib/errors/api-error.ts`), а словарь `lib/errors/error-text.ts` отвечал на него
 * «Сбой на стороне сервера — с вашими данными ничего не случилось. Повторите через минуту».
 *
 * То есть человек, нажавший «Сохранить» на черновике заявки, читал, что сломался сервер, и
 * жал ещё раз — хотя сервер работал, а мешало состояние записи. Ревизия 2026-09-06 нашла
 * 49 таких бросков в шести файлах: документы (21), электронная подпись (20), чат, вебинары
 * и уведомления (8).
 *
 * Инвариант: у каждого броска HTTP-исключения есть код — литералом или переменной,
 * объявленной рядом. Строковая форма запрещена: она молча превращает домен в «сбой сервера».
 */

/**
 * Броски, у которых кода нет по причине, — с объяснением.
 *
 * Пусто: ревизия 2026-09-06 разобрала очередь до конца. Это НЕ разрешение — чтобы попасть
 * сюда, нужна причина, а не желание не писать код.
 */
const ALLOWED: Record<string, string> = {};

const throws = errorThrows();

describe('код ошибки объявлен — кто его кладёт в конверт', () => {
  it('сторож видит броски, а не пустой список', () => {
    // Страховка от немого сторожа: если разбор сломается, тест ниже станет зелёным на пустоте.
    expect(throws.length).toBeGreaterThanOrEqual(360);
  });

  it('у каждого броска HTTP-исключения есть код', () => {
    const naked = throws
      .filter((t) => t.codes.length === 0)
      .filter((t) => !(t.location in ALLOWED));
    const report = naked.map((t) => `${t.location} [${t.exception}] — ${t.shape}`);
    expect(report, `бросков без кода: ${report.length}`).toEqual([]);
  });

  it('код записан как `snake_case`, а не как фраза', () => {
    const odd = throws
      .flatMap((t) => t.codes.map((code) => ({ code, location: t.location })))
      .filter(({ code }) => !CODE_SHAPE.test(code))
      .map(({ code, location }) => `${location} — ${code}`);
    expect(odd).toEqual([]);
  });
  /*
   * Ревизия 2026-09-07 (§5.426). До неё сторож искал только `throw new *Exception(` и не видел
   * бросков через СВОИ классы поверх исключений Nest (`class TenantStateConflictError extends
   * ConflictException`, `PaymentBadRequestError`). Шесть кодов проходили мимо всех трёх
   * проверок семейства, а молчание сторожа читалось как «там всё в порядке».
   *
   * Проверка прямая: если разбор своих классов сломается, этот тест покраснеет — а не молча
   * уменьшится список.
   */
  it('видит броски через свои классы поверх исключений', () => {
    const codes = new Set(throws.flatMap((t) => t.codes));
    expect(codes.has('tenant_state_conflict')).toBe(true);
    expect(codes.has('duplicate_document_number')).toBe(true);
    // Код доводом конструктора: `new PaymentBadRequestError('order_not_payable', …)`.
    expect(codes.has('order_not_payable')).toBe(true);
  });
});
