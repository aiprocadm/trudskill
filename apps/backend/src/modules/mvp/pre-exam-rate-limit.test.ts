import { Controller, Module, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MvpController } from './mvp.controller.js';
import { PRE_EXAM_REQUEST_RATE_LIMIT, PRE_EXAM_VERIFY_RATE_LIMIT } from './pre-exam-rate-limit.js';

/**
 * ФТ-G2: ввод кода допуска к экзамену ограничен по частоте.
 *
 * ТЗ называет «ввод exam-кодов» среди мест, которые обязаны быть под пределом, наравне
 * с логином и публичной проверкой документа. Предел там стоял, а на коде допуска — нет:
 * `verify-pre-exam-token` принимал сколько угодно попыток подряд, и ни счётчика попыток,
 * ни задержки внутри тоже не было.
 *
 * Сам код длинный и случайный, поэтому речь не о том, что его подберут завтра. Речь о
 * том, что подбор ничего не стоит и **не оставляет следа**: нет отказа, нет сигнала,
 * никто не узнает, что кто-то пробует. Предел делает такую попытку заметной.
 *
 * Проверяется тремя способами, потому что каждый по отдельности врёт:
 *  1) числа взяты из общего места, а не переписаны в декоратор заново;
 *  2) на методе стоит `ThrottlerGuard` — без него `@Throttle` молча «спит»
 *     (ровно эта ошибка уже была на `/verify/{qr}`, §5.169);
 *  3) живой HTTP-прогон: запрос сверх предела получает 429.
 */

const ttlOf = (fn: unknown): number | undefined =>
  Reflect.getMetadata('THROTTLER:TTLdefault', fn as object) as number | undefined;
const limitOf = (fn: unknown): number | undefined =>
  Reflect.getMetadata('THROTTLER:LIMITdefault', fn as object) as number | undefined;
const guardsOf = (fn: unknown): Array<{ name?: string }> =>
  (Reflect.getMetadata('__guards__', fn as object) as Array<{ name?: string }> | undefined) ?? [];

describe('ФТ-G2 · код допуска к экзамену под пределом частоты', () => {
  it('проверка кода: предел взят из общего места', () => {
    const fn = MvpController.prototype.verifyPreExamToken;
    expect(limitOf(fn)).toBe(PRE_EXAM_VERIFY_RATE_LIMIT.limit);
    expect(ttlOf(fn)).toBe(PRE_EXAM_VERIFY_RATE_LIMIT.ttl);
  });

  it('запрос кода: предел строже, письмо уходит на почту человека', () => {
    const fn = MvpController.prototype.requestPreExamToken;
    expect(limitOf(fn)).toBe(PRE_EXAM_REQUEST_RATE_LIMIT.limit);
    expect(ttlOf(fn)).toBe(PRE_EXAM_REQUEST_RATE_LIMIT.ttl);
    // Запрос кода обязан быть не мягче проверки: письмо дороже неудачной попытки ввода.
    expect(PRE_EXAM_REQUEST_RATE_LIMIT.limit).toBeLessThanOrEqual(PRE_EXAM_VERIFY_RATE_LIMIT.limit);
  });

  it('на обеих ручках стоит ThrottlerGuard — иначе @Throttle не действует', () => {
    for (const fn of [
      MvpController.prototype.verifyPreExamToken,
      MvpController.prototype.requestPreExamToken
    ]) {
      const guards = guardsOf(fn);
      expect(guards.some((g) => g === ThrottlerGuard || g?.name === 'ThrottlerGuard')).toBe(true);
    }
  });
});

/**
 * Живой прогон предела. Настоящий `MvpController` сюда не поднимается намеренно: он тянет
 * весь модуль, а падение сборки Nest в тестовом процессе уже однажды убивало пул воркеров
 * целиком (см. CLAUDE.md, «Gotchas»). Поэтому предел проверяется на копии контура — теми
 * же числами из общего места: тест доказывает, что при таких значениях запрос сверх
 * предела действительно отбивается 429, а тесты метаданных выше — что боевые ручки
 * объявлены именно ими.
 */
@Controller()
class ExamCodeProbeController {
  @Post('attempts/verify-pre-exam-token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: PRE_EXAM_VERIFY_RATE_LIMIT })
  verify() {
    return { verified: true };
  }
}

describe('ФТ-G2 · предел кода допуска действительно срабатывает (HTTP)', () => {
  let app: { close: () => Promise<void>; getHttpServer: () => { address: () => unknown } };
  let baseUrl = '';

  beforeAll(async () => {
    @Module({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            { ttl: PRE_EXAM_VERIFY_RATE_LIMIT.ttl, limit: PRE_EXAM_VERIFY_RATE_LIMIT.limit }
          ]
        })
      ],
      controllers: [ExamCodeProbeController]
    })
    class TestModule {}

    const created = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
    await created.listen(0, '127.0.0.1');
    const addr = created.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    app = created as never;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it(`попытка сверх предела (${PRE_EXAM_VERIFY_RATE_LIMIT.limit} в минуту) → 429`, async () => {
    const url = `${baseUrl}/attempts/verify-pre-exam-token`;
    const post = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'wrong' })
      });

    let lastStatus = 0;
    for (let i = 0; i < PRE_EXAM_VERIFY_RATE_LIMIT.limit; i += 1) {
      lastStatus = (await post()).status;
    }
    expect(lastStatus).toBe(201); // до предела — обычный ответ

    const blocked = await post();
    expect(blocked.status).toBe(429);
  }, 30_000);
});
