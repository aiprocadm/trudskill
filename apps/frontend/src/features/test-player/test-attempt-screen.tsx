'use client';

import { LoadingState, ProgressBar, useConfirmDialog } from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LEAVE_CONFIRMATION, resolveConnectionStatus } from './connection';
import {
  answeredTotal,
  leaveExamRequest,
  questionHeading,
  questionMarks,
  questionStatement
} from './exam-mode';
import { finishTestRequest } from './finish-confirm';
import { finishSummary } from './finish-summary';
import { formatTimeRemaining, remainingMsFromExpiry } from './format';
import {
  useAttempt,
  useAttemptQuestions,
  useMyTests,
  useSaveAnswer,
  useSubmitAttempt
} from './hooks';
import { RESEND_POLICY, pendingPayloads, resumeNotice, shouldResend } from './resume-and-resend';
import { UNSAVED_ANSWER_SUBMIT_MESSAGE, shouldBlockSubmit } from './submit-guard';
import { PageContainer, SectionCard, SectionError } from '../../components/state-wrappers';
import { serverNow } from '../../lib/api/server-clock';
import { useAuth } from '../auth/context';
import { stopAndCompleteActiveProctoring } from '../proctoring/active-recording';
import { ProctoringRecIndicator, ProctoringResumeBanner } from '../proctoring/screens';

import type { AnswerDraftMap, AttemptQuestion, SaveAnswerPayload } from './types';

interface TestAttemptScreenProps {
  testId: string;
  attemptId: string;
}

const AUTOSAVE_DELAY_MS = 1500;

export function TestAttemptScreen({ testId, attemptId }: TestAttemptScreenProps) {
  const router = useRouter();
  const { session } = useAuth();
  const { data: attempt, isLoading: attemptLoading, error: attemptError } = useAttempt(attemptId);
  const {
    data: questions,
    isLoading: questionsLoading,
    error: questionsError
  } = useAttemptQuestions(attemptId);
  const saveAnswer = useSaveAnswer();
  const submitAttempt = useSubmitAttempt();
  /* ТЗ 5.3 (Э3): «Завершить тест» по кнопке — с подтверждением; автосдача по таймеру — без. */
  const { ask: askFinish, dialog: finishDialog } = useConfirmDialog();
  /* ТЗ 6.2 (С2): выход из режима экзамена — только через явное подтверждение. */
  const { ask: askLeave, dialog: leaveDialog } = useConfirmDialog();
  // Fix I1: the resume banner needs enrollmentId+courseId — derived the same way the tests list
  // does (LearnerTestSummary carries courseId; AttemptDto only knows testId+enrollmentId).
  const { data: myTests } = useMyTests();
  /*
   * Название теста — в верхней полосе режима (ТЗ 6.2). Раньше оно уходило в хлебные крошки
   * оболочки (`useObjectCrumb`), но оболочки на экзамене больше нет, и крошке негде стоять.
   */
  const testTitle = myTests ? (myTests.find((t) => t.testId === testId)?.title ?? 'Тест') : '';
  // Bump to re-render after a resumed recording so the top-level ● REC indicator reappears.
  const [, setProctoringResumeTick] = useState(0);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<AnswerDraftMap>({});
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const autoSubmittedRef = useRef(false);
  const hydratedRef = useRef(false);
  const dirtyRef = useRef<Set<string>>(new Set());

  /*
   * ФТ-H5: число несохранённых ответов — в состоянии, а не только в ref.
   *
   * `dirtyRef` не вызывает перерисовку, поэтому по нему нельзя ни показать признак
   * сохранности, ни включить предупреждение при уходе со страницы. Держим счётчик
   * рядом и обновляем его там же, где меняется сам набор.
   */
  const [unsavedCount, setUnsavedCount] = useState(0);
  // Порция 27: почему сдача не состоялась — человек должен это видеть, а не гадать.
  const [submitBlocked, setSubmitBlocked] = useState<string | null>(null);
  /* ТЗ 6.4 (С4): завершению предшествует экран-сводка — вслепую тест не закончить. */
  const [showSummary, setShowSummary] = useState(false);
  const syncUnsaved = () => setUnsavedCount(dirtyRef.current.size);
  const markDirty = (questionId: string) => {
    dirtyRef.current.add(questionId);
    syncUnsaved();
  };
  const [online, setOnline] = useState(true);

  // Признак связи берём у браузера. Начальное значение читаем в эффекте, а не при
  // первом рендере: на сервере `navigator` не существует, и гидратация разошлась бы.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const current: AttemptQuestion | undefined = questions?.[currentIndex];

  // Hydrate drafts once from the server-echoed saved answers (resume support).
  useEffect(() => {
    if (hydratedRef.current || !questions) return;
    hydratedRef.current = true;
    const seed: AnswerDraftMap = {};
    for (const item of questions) {
      if (item.selectedOptionIds && item.selectedOptionIds.length > 0) {
        seed[item.id] = { selectedOptionIds: item.selectedOptionIds };
      } else if (item.textAnswer !== undefined && item.textAnswer !== '') {
        seed[item.id] = { textAnswer: item.textAnswer };
      }
    }
    if (Object.keys(seed).length > 0) setDrafts(seed);
  }, [questions]);

  /*
   * Countdown timer.
   *
   * Ревизия 2026-08-27 (порция 25): отсчёт идёт по часам СЕРВЕРА (`serverNow`), а не
   * по часам устройства. Отстающие часы слушателя показывали лишние минуты, автосдача
   * уезжала за срок — и попытка обнулялась вместе со всеми ответами.
   */
  useEffect(() => {
    if (!attempt?.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(remainingMsFromExpiry(attempt.expiresAt, serverNow()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attempt?.expiresAt]);

  const goToResult = () =>
    router.push(`/learner/tests/${testId}/result?attemptId=${encodeURIComponent(attemptId)}`);

  // Persist a question's dirty draft immediately, bypassing the autosave debounce. Without this,
  // navigating (or submitting) within AUTOSAVE_DELAY_MS cancels the pending save and the answer is
  // silently lost — critical in a graded exam, where the last question is submitted before its
  // debounce fires. Saving the same answer twice is idempotent, so racing the debounce is safe.
  const flushDraft = async (questionId: string) => {
    if (!dirtyRef.current.has(questionId)) return;
    const draft = drafts[questionId];
    if (!draft) return;
    dirtyRef.current.delete(questionId);
    syncUnsaved();
    const payload: SaveAnswerPayload = {
      questionId,
      ...(draft.selectedOptionIds ? { selectedOptionIds: draft.selectedOptionIds } : {}),
      ...(draft.textAnswer !== undefined ? { textAnswer: draft.textAnswer } : {})
    };
    const saved = await saveAnswer.mutate(attemptId, payload);
    // ФТ-H5: неудача возвращает пометку обратно. Иначе экран показал бы «всё
    // сохранено» ровно там, где ответ до сервера не дошёл, — худшая из возможных
    // подсказок на экзамене.
    if (!saved) {
      dirtyRef.current.add(questionId);
      syncUnsaved();
    }
  };

  const handleSubmit = async ({ auto = false }: { auto?: boolean } = {}) => {
    if (current) await flushDraft(current.id);
    /*
     * Ревизия 2026-08-27 (порция 27, журнал 280): досохранение могло не удаться (связь,
     * ошибка сервера) — тогда пометка «несохранён» возвращается на место. Раньше сдача
     * шла дальше, и попытка финализировалась БЕЗ последнего ответа, а человек видел
     * «Тест завершён». Сдачу по кнопке останавливаем; автосдаче по таймеру выбора нет.
     */
    if (
      shouldBlockSubmit({
        auto,
        currentAnswerUnsaved: Boolean(current && dirtyRef.current.has(current.id))
      })
    ) {
      setSubmitBlocked(UNSAVED_ANSWER_SUBMIT_MESSAGE);
      return;
    }
    setSubmitBlocked(null);
    const result = await submitAttempt.mutate(attemptId);
    if (result) {
      // Phase 4 Plan B: stop the webcam recording and complete the session (fire-and-forget —
      // complete is idempotent; a failure must never block the result screen).
      if (session) void stopAndCompleteActiveProctoring(session);
      goToResult();
    }
  };

  /*
   * Автосдача ровно один раз, когда таймер дошёл до нуля.
   *
   * `handleSubmit` пересоздаётся на каждый рендер, поэтому в зависимостях его держать
   * нельзя: эффект перезапускался бы постоянно. Держим последнюю версию в ref —
   * так линтер видит полный список зависимостей, а поведение остаётся прежним.
   */
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (remainingMs === null || autoSubmittedRef.current) return;
    if (remainingMs <= 0) {
      autoSubmittedRef.current = true;
      void handleSubmitRef.current({ auto: true });
    }
  }, [remainingMs]);

  /*
   * Автосохранение черновика текущего вопроса с задержкой.
   *
   * В зависимостях намеренно только `current?.id` и `drafts`: добавить сюда `saveAnswer`
   * (новый объект на каждый рендер) значило бы сбрасывать таймер автосохранения при
   * каждом ререндере — ответы переставали бы сохраняться вовсе. Мутатор и id попытки
   * берём из ref'ов: они всегда актуальны, но не участвуют в перезапуске эффекта.
   */
  const saveAnswerRef = useRef(saveAnswer);
  saveAnswerRef.current = saveAnswer;
  const attemptIdRef = useRef(attemptId);
  attemptIdRef.current = attemptId;

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    if (!dirtyRef.current.has(currentId)) return;
    const draft = drafts[currentId];
    if (!draft) return;
    const handle = setTimeout(() => {
      const payload: SaveAnswerPayload = {
        questionId: currentId,
        ...(draft.selectedOptionIds ? { selectedOptionIds: draft.selectedOptionIds } : {}),
        ...(draft.textAnswer !== undefined ? { textAnswer: draft.textAnswer } : {})
      };
      void saveAnswerRef.current.mutate(attemptIdRef.current, payload).then((saved) => {
        // ФТ-H5: раньше автосохранение НИКОГДА не снимало пометку, и «несохранённых»
        // становилось столько же, сколько отвеченных вопросов. Снимаем — но только
        // если человек за время запроса не изменил ответ снова: `setDrafts` создаёт
        // новый объект на каждое изменение, поэтому сравнения по ссылке достаточно.
        if (!saved) return;
        if (draftsRef.current[currentId] !== draft) return;
        dirtyRef.current.delete(currentId);
        syncUnsaved();
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [currentId, drafts]);

  /*
   * ФТ-H5: предупреждение при уходе со страницы, пока есть несохранённый ответ.
   *
   * Браузер показывает своё окно и игнорирует наш текст — задать можно только сам
   * факт вопроса. Вешаем обработчик ТОЛЬКО когда терять есть что: постоянный
   * `beforeunload` мешает обычному выходу и отключает восстановление вкладки.
   */
  /*
   * ТЗ 10.1: досылка несохранённых ответов — та самая, которую экран ОБЕЩАЛ и не делал.
   *
   * При пропаже связи он пишет «отправим, как только сеть вернётся», а обработчик события
   * `online` менял только надпись. Автосохранение перезапускается сменой вопроса или правкой
   * ответа — то есть человек, ответивший офлайн и оставшийся на том же вопросе, ждал досылки,
   * которой не будет. На экзамене, где попытка одна, это худший вид неправды.
   *
   * Повтор идёт по времени, а не по одному событию `online`: связь возвращается рывками, и
   * первый же запрос после неё часто ещё падает. Потолка попыток здесь СОЗНАТЕЛЬНО нет, в
   * отличие от опроса данных (задача 1.1): там остановка ничего не теряет, здесь — теряет
   * ответ на экзамене.
   */
  useEffect(() => {
    if (!shouldResend({ online, unsavedCount })) return;
    const resend = () => {
      for (const payload of pendingPayloads([...dirtyRef.current], draftsRef.current)) {
        const questionId = payload.questionId;
        const sentDraft = draftsRef.current[questionId];
        void saveAnswerRef.current.mutate(attemptIdRef.current, payload).then((saved) => {
          if (!saved) return;
          /* Человек мог изменить ответ, пока запрос шёл: тогда пометку снимать нельзя. */
          if (draftsRef.current[questionId] !== sentDraft) return;
          dirtyRef.current.delete(questionId);
          syncUnsaved();
        });
      }
    };
    resend();
    const handle = setInterval(resend, RESEND_POLICY.intervalMs);
    return () => clearInterval(handle);
  }, [online, unsavedCount]);

  useEffect(() => {
    if (unsavedCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = LEAVE_CONFIRMATION;
      return LEAVE_CONFIRMATION;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedCount]);

  if (attemptLoading || questionsLoading) return <LoadingState />;
  if (attemptError || questionsError || !attempt || !questions) {
    return <SectionError message="Не удалось загрузить попытку" />;
  }
  if (questions.length === 0) {
    return <SectionError message="В тесте нет вопросов" />;
  }

  const setChoice = (questionId: string, optionId: string, multiple: boolean) => {
    markDirty(questionId);
    setDrafts((prev) => {
      const existing = prev[questionId]?.selectedOptionIds ?? [];
      const selectedOptionIds = multiple
        ? existing.includes(optionId)
          ? existing.filter((id) => id !== optionId)
          : [...existing, optionId]
        : [optionId];
      return { ...prev, [questionId]: { selectedOptionIds } };
    });
  };

  const setText = (questionId: string, textAnswer: string) => {
    markDirty(questionId);
    setDrafts((prev) => ({ ...prev, [questionId]: { textAnswer } }));
  };

  const q = current!;
  const draft = drafts[q.id] ?? {};
  const isLast = currentIndex === questions.length - 1;
  const timerClass =
    remainingMs === null
      ? ''
      : remainingMs <= 10_000
        ? 'test-timer--danger'
        : remainingMs <= 60_000
          ? 'test-timer--warning'
          : '';

  // Fix I1: detect a recording session orphaned by a mid-exam refresh and offer to resume.
  const attemptInProgress = attempt.status === 'in_progress' || attempt.status === 'draft';
  const testSummary = myTests?.find(
    (t) => t.testId === testId && t.enrollmentId === attempt.enrollmentId
  );

  /*
   * ТЗ 10.1: возвращение в начатую попытку больше не молчит. Ответы подставлялись обратно и
   * раньше, но человек об этом не знал — тот же экран, те же вопросы, и непонятно, продолжает
   * он или начал заново. Считаем по ЧЕРНОВИКАМ: это ровно то, что уже лежит на сервере.
   */
  const answeredCount = answeredTotal(questions, drafts);
  const marks = questionMarks(questions, drafts, currentIndex);
  const summary = finishSummary({
    questions,
    drafts,
    ...(testSummary ? { attemptsUsed: testSummary.attemptsUsed } : {}),
    ...(testSummary ? { attemptLimit: testSummary.attemptLimit } : {})
  });
  const resume = resumeNotice({
    startedAt: attempt.startedAt,
    answeredCount,
    totalCount: questions.length
  });

  const connection = resolveConnectionStatus({
    online,
    unsavedCount,
    saving: saveAnswer.isPending,
    lastError: saveAnswer.error
  });

  return (
    <>
      {/* ТЗ 6.2 (С2): полоса режима вместо оболочки — только то, что относится к попытке. */}
      <header className="exam-bar">
        <span className="exam-bar__test">{testTitle || 'Тест'}</span>
        <span className="test-counter">{questionHeading(currentIndex, questions.length)}</span>
        {remainingMs !== null ? (
          <span className={`test-timer ${timerClass}`}>⏱ {formatTimeRemaining(remainingMs)}</span>
        ) : null}
        <button
          type="button"
          className="ui-button"
          onClick={() =>
            askLeave(leaveExamRequest({ answered: answeredCount, total: questions.length }), () =>
              router.push('/learner/tests')
            )
          }
        >
          Выйти из теста
        </button>
      </header>
      <PageContainer>
        {finishDialog}
        {leaveDialog}
        <ProctoringRecIndicator />
        {resume ? (
          <p
            className="ui-callout ui-callout--info"
            data-testid="attempt-resume-notice"
            role="status"
          >
            {resume}
          </p>
        ) : null}
        {/* ФТ-H5: состояние сохранности видно ВСЕГДА, а не только когда что-то сломалось.
          Индикатор, появляющийся лишь при беде, читается как новая беда; постоянный —
          как приборная панель, по которой сразу видно норму. */}
        <p
          className={`test-connection test-connection--${connection.level}`}
          role={connection.level === 'danger' ? 'alert' : 'status'}
        >
          {connection.message}
        </p>
        {attemptInProgress && testSummary ? (
          <ProctoringResumeBanner
            enrollmentId={attempt.enrollmentId}
            courseId={testSummary.courseId}
            onResumed={() => setProctoringResumeTick((n) => n + 1)}
          />
        ) : null}
        {/*
        ТЗ 6.3 (С3): заголовок — ТОЛЬКО позиция в попытке. Название из банка вопросов несло
        свой номер («Вопрос 3. Кто отвечает…»), и он расходился со счётчиком, потому что
        попытка показывает вопросы в своём порядке (журнал 496).
      */}
        <SectionCard title={questionHeading(currentIndex, questions.length)}>
          {/* Счётчик стоит заголовком — подпись полосе не дублируем. */}
          <ProgressBar
            value={((currentIndex + 1) / questions.length) * 100}
            label="Прогресс по вопросам"
          />
          {questionStatement(q.title) ? (
            <p className="ui-question-text">{questionStatement(q.title)}</p>
          ) : null}
          {q.body ? <p>{q.body}</p> : null}

          {q.type === 'single_choice' || q.type === 'multiple_choice' ? (
            <div className="test-options">
              {q.options.map((o) => (
                <label key={o.id} className="ui-option">
                  <input
                    type={q.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                    name={q.id}
                    checked={(draft.selectedOptionIds ?? []).includes(o.id)}
                    onChange={() => setChoice(q.id, o.id, q.type === 'multiple_choice')}
                  />
                  {o.text}
                </label>
              ))}
            </div>
          ) : null}

          {q.type === 'number_input' && (
            <input
              type="number"
              className="ui-input"
              value={draft.textAnswer ?? ''}
              onChange={(e) => setText(q.id, e.target.value)}
            />
          )}

          {q.type === 'text' && (
            <input
              type="text"
              className="ui-input"
              value={draft.textAnswer ?? ''}
              onChange={(e) => setText(q.id, e.target.value)}
            />
          )}

          {q.type === 'essay' && (
            <textarea
              className="ui-textarea"
              value={draft.textAnswer ?? ''}
              onChange={(e) => setText(q.id, e.target.value)}
            />
          )}
        </SectionCard>

        {/*
        ТЗ 6.2 (С2): список вопросов с отметками «отвечен / пропущен». Без него человек не
        знает, что пропустил, пока не дойдёт до конца, — а на экзамене попытка одна.
      */}
        <nav aria-label="Вопросы теста">
          <ul className="exam-map">
            {marks.map((mark, index) => (
              <li key={mark.id}>
                <button
                  type="button"
                  className={`exam-map__item ${mark.answered ? 'exam-map__item--answered' : ''} ${
                    mark.current ? 'exam-map__item--current' : ''
                  }`}
                  aria-current={mark.current ? 'true' : undefined}
                  title={mark.label}
                  onClick={() => {
                    void flushDraft(q.id);
                    setCurrentIndex(index);
                  }}
                >
                  {mark.number}
                  {mark.answered ? (
                    <span className="exam-map__mark" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                  <span className="ui-visually-hidden">{mark.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          ТЗ 6.4 (С4): сводка перед завершением. Раньше диалог называл ЧИСЛО неотвеченных
          (5.3), но не говорил, какие именно, и не давал к ним вернуться — человек знал, что
          что-то пропустил, и искал перебором (журнал 498). Про последнюю попытку не
          говорилось вовсе (499).
        */}
        {showSummary ? (
          <SectionCard title="Перед завершением">
            <p className="ui-question-text">{summary.headline}</p>
            {summary.unanswered.length > 0 ? (
              <>
                <p className="ui-hint">Без ответа — нажмите номер, чтобы вернуться к вопросу:</p>
                <ul className="exam-map">
                  {summary.unanswered.map((number) => (
                    <li key={number}>
                      <button
                        type="button"
                        className="exam-map__item"
                        onClick={() => {
                          setShowSummary(false);
                          setCurrentIndex(number - 1);
                        }}
                      >
                        {number}
                        <span className="ui-visually-hidden">{`Вернуться к вопросу ${number}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {summary.lastAttemptWarning ? (
              <p className="ui-callout ui-callout--warning" role="alert">
                {summary.lastAttemptWarning}
              </p>
            ) : null}
            <div className="test-nav">
              <button type="button" className="ui-button" onClick={() => setShowSummary(false)}>
                Вернуться к вопросам
              </button>
              <button
                type="button"
                className={`ui-button ui-button--primary ${submitAttempt.isPending ? 'ui-button--loading' : ''}`}
                disabled={submitAttempt.isPending}
                onClick={() =>
                  askFinish(
                    finishTestRequest({
                      unanswered: summary.unanswered.length,
                      total: summary.total,
                      lastAttempt: summary.lastAttempt
                    }),
                    () => void handleSubmit()
                  )
                }
              >
                Завершить тест
              </button>
            </div>
          </SectionCard>
        ) : null}

        <div className="test-nav">
          <button
            type="button"
            className="ui-button"
            disabled={currentIndex === 0}
            onClick={() => {
              void flushDraft(q.id);
              setCurrentIndex((i) => Math.max(0, i - 1));
            }}
          >
            Назад
          </button>
          {isLast ? null : (
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => {
                void flushDraft(q.id);
                setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
              }}
            >
              Следующий вопрос
            </button>
          )}
          {/*
            ТЗ 6.4 (С4): «Завершить» ведёт на СВОДКУ, а не сразу в подтверждение. Кнопка стоит
            внизу на каждом вопросе — с картой вопросов (6.2) человек может быть где угодно, и
            заставлять его долистывать до последнего вопроса ради завершения незачем.
          */}
          <button
            type="button"
            className={`ui-button ${isLast ? 'ui-button--primary' : ''}`}
            onClick={() => {
              void flushDraft(q.id);
              setShowSummary(true);
            }}
          >
            Завершить тест
          </button>
        </div>

        {submitBlocked ? <SectionError message={submitBlocked} /> : null}
        {submitAttempt.error ? <SectionError message={submitAttempt.error} /> : null}
      </PageContainer>
    </>
  );
}
