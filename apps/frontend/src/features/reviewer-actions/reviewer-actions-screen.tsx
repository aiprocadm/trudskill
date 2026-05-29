'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import { useState } from 'react';

import { reviewerActionsApi } from './api';
import { formatQueueKind } from './format';
import {
  useCompleteAttemptReview,
  useCompleteReview,
  useReturnSubmission,
  useReviewerQueue,
  useTakeIntoReview
} from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { ReviewerQueueItem } from './types';
import type { Column } from '@cdoprof/ui';

/* ---------- Submission action panel ---------- */

function SubmissionActions({ item }: { item: ReviewerQueueItem }) {
  const { session } = useAuth();
  const takeIntoReview = useTakeIntoReview();
  const completeReview = useCompleteReview();
  const returnSubmission = useReturnSubmission();

  const [reviewId, setReviewId] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [returnComment, setReturnComment] = useState('');

  const onTake = async () => {
    const result = await takeIntoReview.mutate({ submissionId: item.id });
    if (result) setReviewId(result.id);
  };

  const onComplete = async () => {
    if (!reviewId) return;
    await completeReview.mutate(reviewId, {
      ...(score !== '' ? { score: Number(score) } : {}),
      ...(comment !== '' ? { comment } : {})
    });
  };

  const onReturn = async () => {
    await returnSubmission.mutate(item.id, {
      ...(returnComment !== '' ? { comment: returnComment } : {})
    });
  };

  const onDownloadFile = async () => {
    if (!session) return;
    const result = await reviewerActionsApi.submissionFileUrl(session, item.id);
    window.open(result.url, '_blank');
  };

  return (
    <div className="ui-stack">
      {!reviewId ? (
        <button type="button" disabled={takeIntoReview.isPending} onClick={() => void onTake()}>
          Взять в проверку
        </button>
      ) : (
        <>
          <div>
            <input
              type="number"
              placeholder="Балл"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
            <input
              type="text"
              placeholder="Комментарий"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              type="button"
              disabled={completeReview.isPending}
              onClick={() => void onComplete()}
            >
              Завершить
            </button>
          </div>
          <div>
            <input
              type="text"
              placeholder="Причина возврата"
              value={returnComment}
              onChange={(e) => setReturnComment(e.target.value)}
            />
            <button
              type="button"
              disabled={returnSubmission.isPending}
              onClick={() => void onReturn()}
            >
              Вернуть на доработку
            </button>
          </div>
        </>
      )}
      <button type="button" onClick={() => void onDownloadFile()}>
        Скачать файл
      </button>
      {takeIntoReview.error ? <SectionError message={takeIntoReview.error} /> : null}
      {completeReview.error ? <SectionError message={completeReview.error} /> : null}
      {returnSubmission.error ? <SectionError message={returnSubmission.error} /> : null}
    </div>
  );
}

/* ---------- Attempt (essay) action panel ---------- */

function AttemptActions({ item }: { item: ReviewerQueueItem }) {
  const completeAttemptReview = useCompleteAttemptReview();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [reviewComment, setReviewComment] = useState('');

  const essays = item.essayAnswers ?? [];

  const onGradeEssay = async () => {
    const answerScores = essays.map((e) => ({
      questionId: e.questionId,
      score: Number(scores[e.questionId] ?? 0)
    }));
    await completeAttemptReview.mutate(item.id, {
      answerScores,
      ...(reviewComment !== '' ? { reviewComment } : {})
    });
  };

  if (essays.length === 0) {
    return (
      <div className="ui-stack">
        <span>нет эссе для проверки</span>
      </div>
    );
  }

  return (
    <div className="ui-stack">
      {essays.map((e) => (
        <div key={e.questionId}>
          <p>
            <strong>{e.questionTitle}</strong>
          </p>
          <p>{e.answerText}</p>
          <input
            type="number"
            placeholder="Балл"
            value={scores[e.questionId] ?? ''}
            onChange={(ev) => setScores((prev) => ({ ...prev, [e.questionId]: ev.target.value }))}
          />
        </div>
      ))}
      <input
        type="text"
        placeholder="Комментарий"
        value={reviewComment}
        onChange={(e) => setReviewComment(e.target.value)}
      />
      <button
        type="button"
        disabled={completeAttemptReview.isPending}
        onClick={() => void onGradeEssay()}
      >
        Завершить проверку
      </button>
      {completeAttemptReview.error ? <SectionError message={completeAttemptReview.error} /> : null}
    </div>
  );
}

/* ---------- Main screen ---------- */

export function ReviewerActionsScreen() {
  const queue = useReviewerQueue();

  const attemptColumns: Column<ReviewerQueueItem>[] = [
    { key: 'kind', title: 'Тип', render: (i) => formatQueueKind(i.kind) },
    { key: 'learnerId', title: 'Учащийся', render: (i) => i.learnerId },
    { key: 'testId', title: 'Тест', render: (i) => i.testId ?? '—' },
    { key: 'submittedAt', title: 'Отправлено', render: (i) => i.submittedAt },
    {
      key: 'id',
      title: 'Действия',
      render: (i) => <AttemptActions item={i} />
    }
  ];

  const submissionColumns: Column<ReviewerQueueItem>[] = [
    { key: 'kind', title: 'Тип', render: (i) => formatQueueKind(i.kind) },
    { key: 'learnerId', title: 'Учащийся', render: (i) => i.learnerId },
    { key: 'assignmentId', title: 'Задание', render: (i) => i.assignmentId ?? '—' },
    { key: 'submittedAt', title: 'Отправлено', render: (i) => i.submittedAt },
    {
      key: 'id',
      title: 'Действия',
      render: (i) => <SubmissionActions item={i} />
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Очередь на проверку"
        subtitle="Тестовые попытки с эссе-вопросами и практические работы, требующие ручного ревью."
      />

      {queue.isLoading ? (
        <LoadingState message="Загрузка очереди…" />
      ) : queue.error ? (
        <SectionError
          message={
            queue.error instanceof Error ? queue.error.message : 'Не удалось загрузить очередь'
          }
          onRetry={() => void queue.refetch()}
        />
      ) : (
        <>
          <SectionCard title="Попытки тестов">
            {queue.data && queue.data.pendingAttempts.length > 0 ? (
              <DataTable<ReviewerQueueItem>
                columns={attemptColumns}
                rows={queue.data.pendingAttempts}
              />
            ) : (
              <SectionEmpty
                message="Pending attempts отсутствуют"
                hint="Попытки с эссе-вопросами появятся здесь после отправки учащимися."
              />
            )}
          </SectionCard>

          <SectionCard title="Практические работы">
            {queue.data && queue.data.pendingSubmissions.length > 0 ? (
              <DataTable<ReviewerQueueItem>
                columns={submissionColumns}
                rows={queue.data.pendingSubmissions}
              />
            ) : (
              <SectionEmpty
                message="Pending submissions отсутствуют"
                hint="Практические работы появятся здесь после отправки учащимися."
              />
            )}
          </SectionCard>
        </>
      )}
    </PageContainer>
  );
}
