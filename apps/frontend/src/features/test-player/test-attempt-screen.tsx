'use client';

import { LoadingState, ProgressBar } from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LEAVE_CONFIRMATION, resolveConnectionStatus } from './connection';
import { formatTimeRemaining, remainingMsFromExpiry } from './format';
import {
  useAttempt,
  useAttemptQuestions,
  useMyTests,
  useSaveAnswer,
  useSubmitAttempt
} from './hooks';
import { UNSAVED_ANSWER_SUBMIT_MESSAGE, shouldBlockSubmit } from './submit-guard';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
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
  // Fix I1: the resume banner needs enrollmentId+courseId — derived the same way the tests list
  // does (LearnerTestSummary carries courseId; AttemptDto only knows testId+enrollmentId).
  const { data: myTests } = useMyTests();
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

  const connection = resolveConnectionStatus({
    online,
    unsavedCount,
    saving: saveAnswer.isPending,
    lastError: saveAnswer.error
  });

  return (
    <PageContainer>
      <PageHeader title="Прохождение теста" />
      <ProctoringRecIndicator />
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
      <SectionCard title={q.title}>
        <div className="test-meta">
          <span className="test-counter">
            Вопрос {currentIndex + 1} из {questions.length}
          </span>
          {remainingMs !== null ? (
            <span className={`test-timer ${timerClass}`}>⏱ {formatTimeRemaining(remainingMs)}</span>
          ) : null}
        </div>
        {/* Счётчик «Вопрос N из M» стоит строкой выше — подпись полосе не дублируем. */}
        <ProgressBar
          value={((currentIndex + 1) / questions.length) * 100}
          label="Прогресс по вопросам"
        />
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
        {isLast ? (
          <button
            type="button"
            className={`ui-button ui-button--primary ${submitAttempt.isPending ? 'ui-button--loading' : ''}`}
            disabled={submitAttempt.isPending}
            onClick={() => void handleSubmit()}
          >
            Завершить тест
          </button>
        ) : (
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
      </div>

      {submitBlocked ? <SectionError message={submitBlocked} /> : null}
      {submitAttempt.error ? <SectionError message={submitAttempt.error} /> : null}
    </PageContainer>
  );
}
