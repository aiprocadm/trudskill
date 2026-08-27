import { gradeAnswer } from '../assessment-autograde.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import type { AttemptAnswer, TestAttempt } from '../mvp.types.js';

/**
 * Ревизия 2026-08-27 (порция 30, журнал 285) — подсчёт баллов попытки по её ответам.
 *
 * Раньше подсчёт жил ВНУТРИ сдачи, поэтому попытка, у которой истекло время, не
 * оценивалась вовсе: ответы, честно данные до звонка, пропадали, а попытка при этом
 * списывалась из лимита. Решение владельца передано агенту 27.08 — оценивать.
 *
 * Лазейки это не открывает: ответы ПОСЛЕ истечения сервер не принимает (см. `saveAnswer`),
 * поэтому оценивается ровно то, что было записано в срок. Так же поступают с бумажной
 * работой: по звонку её собирают и проверяют написанное, а не выбрасывают за то, что
 * человек не отнёс её сам.
 *
 * Функция работает от состояния арендатора, потому что звать её должны двое: сдача
 * (внутри запроса) и ночной сканер просроченных попыток (вне запроса).
 */
export interface GradeAttemptDeps {
  /** Текущее время в ISO — у сервиса и у сканера оно своё. */
  now: () => string;
  /** Идентификатор для заглушки ответа под ручную проверку. */
  makeAnswerId: () => string;
}

export function gradeAttemptFromState(
  state: InMemoryMvpState,
  tenantId: string,
  attempt: TestAttempt,
  deps: GradeAttemptDeps
): number {
  const answers = state.attemptAnswers.filter(
    (item) => item.tenantId === tenantId && item.attemptId === attempt.id
  );
  let score = 0;
  for (const questionId of attempt.questionOrder) {
    const question = state.questions.find(
      (item) => item.tenantId === tenantId && item.id === questionId
    );
    if (!question) continue;
    const options = state.answerOptions.filter(
      (item) => item.tenantId === tenantId && item.questionId === questionId
    );
    let answer = answers.find((item) => item.questionId === questionId);
    const graded = gradeAnswer({ question, options, answer });
    /*
     * §5.160: вопрос под ручную проверку (эссе либо неверно настроенный авто), оставленный
     * БЕЗ ответа, не имеет строки ответа — и признак «оценивает человек» потерялся бы:
     * попытка выглядела бы полностью проверенной автоматом и публиковала бы зачёт до
     * обязательной проверки, а проверяющий не смог бы её оценить. Заводим строку-заглушку.
     */
    if (!answer && !graded.autoGraded) {
      answer = {
        id: deps.makeAnswerId(),
        tenantId,
        attemptId: attempt.id,
        questionId,
        status: 'active',
        createdAt: deps.now(),
        updatedAt: deps.now()
      } as AttemptAnswer;
      state.attemptAnswers.push(answer);
    }
    if (answer) {
      answer.score = graded.score;
      answer.autoGraded = graded.autoGraded;
      answer.updatedAt = deps.now();
    }
    score += graded.score;
  }
  return score;
}
