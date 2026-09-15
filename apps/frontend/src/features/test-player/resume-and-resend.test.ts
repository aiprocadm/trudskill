import { describe, expect, it } from 'vitest';

import { RESEND_POLICY, pendingPayloads, resumeNotice, shouldResend } from './resume-and-resend';

import type { AnswerDraftMap } from './types';

/**
 * Досылка ответов и возвращение к попытке (ТЗ «Стабилизация, UX и развитие», 10.1).
 *
 * Экран при пропаже связи обещал: «отправим, как только сеть вернётся». Обработчик события
 * `online` менял только НАДПИСЬ — досылки не было ни одной. На экзамене, где попытка одна,
 * это худший вид неправды.
 */

const drafts: AnswerDraftMap = {
  q1: { selectedOptionIds: ['o1'] },
  q2: { textAnswer: 'ответ словами' },
  q3: { selectedOptionIds: [] }
};

describe('досылка несохранённых ответов (ТЗ 10.1)', () => {
  it('собирает отправку по каждому несохранённому ответу', () => {
    const payloads = pendingPayloads(['q1', 'q2'], drafts);
    expect(payloads).toEqual([
      { questionId: 'q1', selectedOptionIds: ['o1'] },
      { questionId: 'q2', textAnswer: 'ответ словами' }
    ]);
  });

  it('вопрос без черновика пропускается — слать нечего', () => {
    expect(pendingPayloads(['q1', 'неизвестный'], drafts)).toHaveLength(1);
  });

  it('досылает, когда есть связь и есть что досылать', () => {
    expect(shouldResend({ online: true, unsavedCount: 2 })).toBe(true);
  });

  it('без связи не досылает: запрос всё равно не уйдёт', () => {
    expect(shouldResend({ online: false, unsavedCount: 2 })).toBe(false);
  });

  it('нечего досылать — не трогает сервер', () => {
    expect(shouldResend({ online: true, unsavedCount: 0 })).toBe(false);
  });

  it('срок повтора — настройка со значением по умолчанию', () => {
    expect(RESEND_POLICY.intervalMs).toBe(10_000);
  });
});

describe('возвращение к начатой попытке (ТЗ 10.1)', () => {
  it('говорит, когда начата попытка и сколько отвечено', () => {
    const notice = resumeNotice({
      startedAt: '2026-09-15T11:32:00.000Z',
      answeredCount: 7,
      totalCount: 20
    });
    expect(notice).toContain('Отвечено 7 из 20');
    expect(notice, 'время показываем человеку, а не в виде метки сервера').not.toContain('T11:32');
  });

  it('ничего не отвечено — сообщения нет: это не продолжение, а начало', () => {
    expect(
      resumeNotice({ startedAt: '2026-09-15T11:32:00.000Z', answeredCount: 0, totalCount: 20 })
    ).toBeNull();
  });

  it('нет времени начала или вопросов — молчим, а не выдумываем', () => {
    expect(resumeNotice({ startedAt: undefined, answeredCount: 3, totalCount: 20 })).toBeNull();
    expect(
      resumeNotice({ startedAt: '2026-09-15T11:32:00.000Z', answeredCount: 3, totalCount: 0 })
    ).toBeNull();
  });

  it('битая метка времени не роняет экран и не показывает мусор', () => {
    expect(resumeNotice({ startedAt: 'не дата', answeredCount: 3, totalCount: 20 })).toBeNull();
  });
});
