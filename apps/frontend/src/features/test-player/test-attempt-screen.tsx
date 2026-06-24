'use client';

import { LoadingState } from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { formatTimeRemaining, remainingMsFromExpiry } from './format';
import {
  useAttempt,
  useAttemptQuestions,
  useMyTests,
  useSaveAnswer,
  useSubmitAttempt
} from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
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

  // Countdown timer.
  useEffect(() => {
    if (!attempt?.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(remainingMsFromExpiry(attempt.expiresAt, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attempt?.expiresAt]);

  const goToResult = () =>
    router.push(`/learner/tests/${testId}/result?attemptId=${encodeURIComponent(attemptId)}`);

  const handleSubmit = async () => {
    const result = await submitAttempt.mutate(attemptId);
    if (result) {
      // Phase 4 Plan B: stop the webcam recording and complete the session (fire-and-forget —
      // complete is idempotent; a failure must never block the result screen).
      if (session) void stopAndCompleteActiveProctoring(session);
      goToResult();
    }
  };

  // Auto-submit exactly once when the timer hits zero.
  useEffect(() => {
    if (remainingMs === null || autoSubmittedRef.current) return;
    if (remainingMs <= 0) {
      autoSubmittedRef.current = true;
      void handleSubmit();
    }
  }, [remainingMs]);

  // Debounced auto-save of the current question's draft (only if user-modified).
  useEffect(() => {
    if (!current) return;
    if (!dirtyRef.current.has(current.id)) return;
    const draft = drafts[current.id];
    if (!draft) return;
    const handle = setTimeout(() => {
      const payload: SaveAnswerPayload = {
        questionId: current.id,
        ...(draft.selectedOptionIds ? { selectedOptionIds: draft.selectedOptionIds } : {}),
        ...(draft.textAnswer !== undefined ? { textAnswer: draft.textAnswer } : {})
      };
      void saveAnswer.mutate(attemptId, payload);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [current?.id, drafts]);

  if (attemptLoading || questionsLoading) return <LoadingState />;
  if (attemptError || questionsError || !attempt || !questions) {
    return <SectionError message="Не удалось загрузить попытку" />;
  }
  if (questions.length === 0) {
    return <SectionError message="В тесте нет вопросов" />;
  }

  const setChoice = (questionId: string, optionId: string, multiple: boolean) => {
    dirtyRef.current.add(questionId);
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
    dirtyRef.current.add(questionId);
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

  return (
    <PageContainer>
      <PageHeader title="Прохождение теста" />
      <ProctoringRecIndicator />
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
        <progress
          max={questions.length}
          value={currentIndex + 1}
          aria-label="Прогресс по вопросам"
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
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
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
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
          >
            Далее
          </button>
        )}
      </div>

      {submitAttempt.error ? <SectionError message={submitAttempt.error} /> : null}
    </PageContainer>
  );
}
