import { describe, expect, it, vi } from 'vitest';

import { ExpiredAttemptsScanner } from './expired-attempts.scanner.service.js';

import type { AuditService } from '../../audit/audit.service.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Закрытие истёкших попыток сервером (ФТ-E2, Фаза 2 Task 12).
 * Раньше таймер срабатывал только когда клиент трогал попытку — закрыл вкладку,
 * и попытка висела `in_progress` навсегда.
 */

const T = 'tenant_demo';
const NOW = '2026-07-28T12:00:00.000Z';

/**
 * Порция 30 (журнал 285): сканер теперь ещё и считает баллы по сохранённым в срок
 * ответам, поэтому состоянию нужны все коллекции, которых требует подсчёт.
 */
function makeState(attempts: unknown[], over: Record<string, unknown> = {}): InMemoryMvpState {
  return {
    attempts,
    tests: [],
    questions: [],
    answerOptions: [],
    attemptAnswers: [],
    ...over
  } as unknown as InMemoryMvpState;
}

function makeScanner() {
  const write = vi.fn();
  const scanner = new ExpiredAttemptsScanner({ write } as unknown as AuditService);
  return { scanner, write };
}

const attempt = (over: Record<string, unknown> = {}) => ({
  tenantId: T,
  id: 'att_1',
  testId: 'test_1',
  status: 'in_progress',
  expiresAt: '2026-07-28T11:00:00.000Z',
  questionOrder: [],
  ...over
});

describe('ExpiredAttemptsScanner', () => {
  it('закрывает попытку, у которой вышло время, даже если клиент молчит', () => {
    const state = makeState([attempt()]);
    const { scanner, write } = makeScanner();

    expect(scanner.scanTenant(T, NOW, state)).toBe(1);
    const row = (state.attempts as unknown as Array<Record<string, unknown>>)[0]!;
    expect(row.status).toBe('expired');
    expect(row.finishedAt).toBe(NOW);
    // Действие системы обязано попасть в аудит: это изменение результата слушателя.
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'assessment.attempt_expired_by_timer', actorId: 'system' })
    );
  });

  it('не трогает попытку, время которой ещё не вышло', () => {
    const state = makeState([attempt({ expiresAt: '2026-07-28T13:00:00.000Z' })]);
    const { scanner } = makeScanner();

    expect(scanner.scanTenant(T, NOW, state)).toBe(0);
    expect((state.attempts as unknown as Array<Record<string, unknown>>)[0]!.status).toBe(
      'in_progress'
    );
  });

  it('бессрочная попытка не закрывается — закрывать её нечем', () => {
    const state = makeState([attempt({ expiresAt: undefined })]);
    const { scanner } = makeScanner();
    expect(scanner.scanTenant(T, NOW, state)).toBe(0);
  });

  it('терминальные попытки не переписываются', () => {
    const state = makeState([
      attempt({ id: 'a1', status: 'submitted' }),
      attempt({ id: 'a2', status: 'finished' }),
      attempt({ id: 'a3', status: 'expired' })
    ]);
    const { scanner } = makeScanner();
    expect(scanner.scanTenant(T, NOW, state)).toBe(0);
  });

  it('не сбивает уже проставленное время завершения', () => {
    const state = makeState([attempt({ finishedAt: '2026-07-28T10:30:00.000Z' })]);
    const { scanner } = makeScanner();

    scanner.scanTenant(T, NOW, state);

    expect((state.attempts as unknown as Array<Record<string, unknown>>)[0]!.finishedAt).toBe(
      '2026-07-28T10:30:00.000Z'
    );
  });

  it('чужой тенант не трогается', () => {
    const state = makeState([attempt({ tenantId: 'tenant_other' })]);
    const { scanner } = makeScanner();
    expect(scanner.scanTenant(T, NOW, state)).toBe(0);
  });

  it('битая дата запуска не роняет сканер', () => {
    const state = makeState([attempt()]);
    const { scanner } = makeScanner();
    expect(scanner.scanTenant(T, 'не дата', state)).toBe(0);
  });

  it('повторный прогон ничего не меняет — сканер идемпотентен', () => {
    const state = makeState([attempt()]);
    const { scanner } = makeScanner();

    expect(scanner.scanTenant(T, NOW, state)).toBe(1);
    expect(scanner.scanTenant(T, NOW, state)).toBe(0);
  });
});

/*
 * Ревизия 2026-08-27 (порция 30, журнал 285) — решение владельца передано агенту:
 * ответы, сохранённые В СРОК, не пропадают. Этот путь главный: чаще всего попытка
 * истекает не «на секунду позже кнопки», а потому что человек закрыл вкладку.
 */
describe('сканер оценивает закрываемую попытку (порция 30)', () => {
  const withOneQuestion = (answerText: string | undefined) =>
    makeState([attempt({ questionOrder: ['q1'] })], {
      tests: [{ tenantId: T, id: 'test_1', rules: { passingScore: 2 } }],
      questions: [
        {
          tenantId: T,
          id: 'q1',
          type: 'number_input',
          score: 2,
          numericExpected: 4,
          numericTolerance: 0.01
        }
      ],
      answerOptions: [],
      attemptAnswers:
        answerText === undefined
          ? []
          : [
              {
                tenantId: T,
                id: 'ans1',
                attemptId: 'att_1',
                questionId: 'q1',
                textAnswer: answerText
              }
            ]
    });

  it('верный ответ, данный до звонка, засчитан', () => {
    const { scanner } = makeScanner();
    const state = withOneQuestion('4');

    expect(scanner.scanTenant(T, NOW, state)).toBe(1);

    const closed = state.attempts[0] as unknown as {
      status: string;
      score: number;
      passed: boolean;
    };
    expect(closed.status).toBe('expired');
    expect(closed.score).toBe(2);
    expect(closed.passed).toBe(true);
  });

  it('брошенная без ответов попытка закрывается нулём, а не зачётом', () => {
    const { scanner } = makeScanner();
    const state = withOneQuestion(undefined);

    scanner.scanTenant(T, NOW, state);

    const closed = state.attempts[0] as unknown as { score: number; passed: boolean };
    expect(closed.score).toBe(0);
    expect(closed.passed).toBe(false);
  });

  it('в журнале виден балл: попытку оценили, а не просто сняли с висяка', () => {
    const { scanner, write } = makeScanner();
    scanner.scanTenant(T, NOW, withOneQuestion('4'));

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'assessment.attempt_expired_by_timer',
        newValues: expect.objectContaining({ score: 2 })
      })
    );
  });
});
