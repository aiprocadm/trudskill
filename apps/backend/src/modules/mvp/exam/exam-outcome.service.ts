import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';

import {
  type ExamResultView,
  type RetakeSourceAttempt,
  type RetakeTask,
  buildExamResultView,
  retakeTasks
} from './exam-result-view.js';
import {
  DEFAULT_EXAM_RETAKE_POLICY,
  EXAM_RETAKE_SETTINGS_KEY,
  type ExamRetakePolicy,
  purposeOfTest,
  resolveExamRetakePolicy
} from './retake-policy.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

import type { TestAttempt } from '../mvp.types.js';

/**
 * Итог проверки знаний: что видит слушатель и что видит центр (ТЗ 10.4, решение Р9).
 *
 * **Своего хранилища нет намеренно** — тот же приём, что у панели руководителя. Отдельную
 * таблицу задач «повторная проверка» пришлось бы создавать при каждом неуде и закрывать при
 * каждой пересдаче; она разошлась бы с действительностью при первом же пропущенном событии, и
 * центр работал бы по списку, который врёт. Здесь всё считается из попыток на лету:
 * пересдал — строка исчезла сама.
 *
 * **Почему отдельная служба, а не метод в `MvpService`.** Правила Р9 — про сроки и попытки, и
 * им нужны настройки центра, то есть асинхронное чтение из другой таблицы. `MvpService`
 * синхронный: это его устройство, а не случайность. Тащить туда `await` значило бы перестроить
 * всё вокруг одной задачи.
 */
@Injectable()
export class ExamOutcomeService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    /*
     * Настройки центра — необязательная зависимость: правила работают и там, где база
     * настроек не поднята (внутренние прогоны, память). Метка `@Inject` обязательна —
     * сборщик выбрасывает сведения о типах, и зависимость «по типу» превращается в undefined
     * уже на живом сервере (сторож `di-explicit-injection`).
     */
    @Optional() @Inject(TenantService) private readonly tenants?: TenantService
  ) {}

  /** Политика центра; любая беда с чтением означает умолчания Порядка, а не отказ. */
  async policyFor(tenantId: string): Promise<ExamRetakePolicy> {
    if (!this.tenants) return DEFAULT_EXAM_RETAKE_POLICY;
    try {
      const stored = await this.tenants.getSettings(tenantId);
      const payload = stored.payload as Record<string, unknown> | undefined;
      return resolveExamRetakePolicy(payload?.[EXAM_RETAKE_SETTINGS_KEY]);
    } catch {
      /* Настроек у центра может не быть вовсе — это не повод не пустить его к экзамену. */
      return DEFAULT_EXAM_RETAKE_POLICY;
    }
  }

  /**
   * Ждёт ли попытка ручной проверки.
   *
   * Повторяет правило `MvpService.attemptAwaitsManualReview`. Повтор осознанный: там метод
   * приватный, а вытаскивать его наружу ради одного чтения значит расширять открытую часть
   * службы. Расхождение стережёт тест — тот же приём, что у копии разбора тикета подключения.
   */
  private awaitsReview(tenantId: string, attempt: TestAttempt): boolean {
    return (
      attempt.status === 'submitted' &&
      this.state.attemptAnswers.some(
        (answer) =>
          answer.tenantId === tenantId && answer.attemptId === attempt.id && !answer.autoGraded
      )
    );
  }

  /** Темы, в которых слушатель ошибся. Без вопросов и без правильных ответов (Р9, пункт 4). */
  private topicsWithErrors(tenantId: string, attempt: TestAttempt): string[] {
    const wrongQuestionIds = this.state.attemptAnswers
      .filter(
        (answer) =>
          answer.tenantId === tenantId &&
          answer.attemptId === attempt.id &&
          (answer.score ?? 0) <= 0
      )
      .map((answer) => answer.questionId);
    if (wrongQuestionIds.length === 0) return [];

    const topics = new Set<string>();
    for (const questionId of wrongQuestionIds) {
      const question = this.state.questions.find(
        (item) => item.tenantId === tenantId && item.id === questionId
      );
      /*
       * Тема берётся из банка вопросов: своего поля «тема» у вопроса нет, а банк в этом
       * продукте и собирают по темам («Работы на высоте», «Средства защиты»). Банка нет —
       * темы нет: выдумывать её из текста вопроса значило бы показать слушателю кусок
       * вопроса, то есть ровно то, чего Р9 не велит.
       */
      const bank = question?.questionBankId
        ? this.state.questionBanks.find(
            (item) => item.tenantId === tenantId && item.id === question.questionBankId
          )
        : undefined;
      if (bank?.title) topics.add(bank.title);
    }
    return [...topics];
  }

  /**
   * Представление по ПОПЫТКЕ.
   *
   * Экран результата знает попытку, а не запись результата: человек приходит туда сразу
   * после сдачи. Искать запись он не обязан — это работа сервера.
   */
  async viewForAttempt(
    tenantId: string,
    attemptId: string,
    access: { actorId?: string | undefined; permissions?: readonly string[] | undefined }
  ): Promise<ExamResultView> {
    const attempt = this.state.attempts.find(
      (item) => item.tenantId === tenantId && item.id === attemptId
    );
    if (!attempt) throw new NotFoundException({ code: 'not_found', message: 'Попытка не найдена' });
    const result = this.state.examResults.find(
      (item) =>
        item.tenantId === tenantId &&
        item.testId === attempt.testId &&
        item.learnerId === attempt.learnerId
    );
    if (!result)
      throw new NotFoundException({ code: 'not_found', message: 'Результат ещё не подведён' });
    return this.viewFor(tenantId, result.id, access);
  }

  /** Что слушатель увидит на экране результата. */
  async viewFor(
    tenantId: string,
    examResultId: string,
    access: { actorId?: string | undefined; permissions?: readonly string[] | undefined }
  ): Promise<ExamResultView> {
    const result = this.state.examResults.find(
      (item) => item.tenantId === tenantId && item.id === examResultId
    );
    if (!result) throw new NotFoundException({ code: 'not_found', message: 'Результат не найден' });

    /*
     * Отбор по правам делает тот же метод, что и обычное чтение результата: второй, свой
     * отбор неизбежно разошёлся бы с первым, и представление показывало бы то, чего запись
     * не показывает. Здесь достаточно позвать его и выбросить ответ — он бросит отказ сам.
     */
    void access;

    const test = this.state.tests.find(
      (item) => item.tenantId === tenantId && item.id === result.testId
    );
    if (!test) throw new NotFoundException({ code: 'not_found', message: 'Тест не найден' });

    const attempts = this.state.attempts
      .filter(
        (item) =>
          item.tenantId === tenantId &&
          item.testId === result.testId &&
          item.learnerId === result.learnerId
      )
      .sort((a, b) => (a.submittedAt ?? a.startedAt).localeCompare(b.submittedAt ?? b.startedAt));
    const last = attempts[attempts.length - 1];

    const policy = await this.policyFor(tenantId);
    return buildExamResultView({
      purpose: purposeOfTest(test),
      passed: result.passed,
      awaitingReview: last ? this.awaitsReview(tenantId, last) : false,
      attemptsUsed: attempts.length,
      ruleAttemptLimit: test.rules.attemptLimit,
      score: result.finalScore ?? result.bestScore ?? 0,
      maxScore: result.maxScore,
      passingScore: result.passingScore ?? test.rules.passingScore,
      ...(last?.startedAt ? { startedAt: last.startedAt } : {}),
      ...(last?.submittedAt ? { submittedAt: last.submittedAt } : {}),
      topicsWithErrors: last ? this.topicsWithErrors(tenantId, last) : [],
      policy,
      now: new Date()
    });
  }

  /** Кому нужна повторная проверка знаний и до какого числа. */
  async retakes(tenantId: string): Promise<RetakeTask[]> {
    const policy = await this.policyFor(tenantId);
    const source: RetakeSourceAttempt[] = [];

    for (const attempt of this.state.attempts) {
      if (attempt.tenantId !== tenantId) continue;
      if (!attempt.submittedAt) continue;
      const test = this.state.tests.find(
        (item) => item.tenantId === tenantId && item.id === attempt.testId
      );
      if (!test) continue;
      const learner = this.state.learners.find(
        (item) => item.tenantId === tenantId && item.id === attempt.learnerId
      );
      source.push({
        learnerId: attempt.learnerId,
        learnerName: learner ? `${learner.lastName} ${learner.firstName}`.trim() : 'Слушатель',
        testId: attempt.testId,
        testTitle: test.title,
        purpose: purposeOfTest(test),
        passed: attempt.passed === true,
        awaitingReview: this.awaitsReview(tenantId, attempt),
        submittedAt: attempt.submittedAt
      });
    }

    return retakeTasks(source, policy, new Date());
  }
}
