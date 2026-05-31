'use client';

import { LoadingState } from '@cdoprof/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { formatAttemptsLeft, formatLearnerTestStatus, formatScoreLine } from './format';
import { useMyTests, useRequestPreExamToken, useStartAttempt } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { LearnerTestSummary } from './types';

function TestRow({ test }: { test: LearnerTestSummary }) {
  const router = useRouter();
  const start = useStartAttempt();
  const requestLink = useRequestPreExamToken();
  const attemptsLeft = test.attemptLimit - test.attemptsUsed;

  // Gate detection: match both the error code token and the English message text.
  // useStartAttempt stores err.message (from ApiClientError), which is the backend's
  // English message "Identity verification is required before starting this exam".
  // We also match 'pre_exam_auth_required' in case the message format ever changes.
  const needsPreExamAuth = /pre_exam_auth_required|identity verification is required/i.test(
    start.error ?? ''
  );

  const onStart = async () => {
    const attempt = await start.mutate({
      testId: test.testId,
      enrollmentId: test.enrollmentId,
      learnerId: test.learnerId
    });
    if (attempt) {
      router.push(`/learner/tests/${test.testId}/attempt/${attempt.id}`);
    }
  };

  const onSendLink = async () => {
    await requestLink.mutate({
      testId: test.testId,
      enrollmentId: test.enrollmentId,
      learnerId: test.learnerId
    });
  };

  return (
    <li className="ui-stack">
      <span className="ui-list-title">{test.title}</span>
      <span>{formatLearnerTestStatus(test.status)}</span>
      <span>{formatAttemptsLeft(test.attemptsUsed, test.attemptLimit)}</span>
      {test.bestScore !== undefined ? (
        <span>Лучший результат: {formatScoreLine(test.bestScore, test.maxScore)}</span>
      ) : null}
      {test.activeAttemptId ? (
        <Link
          className="ui-button"
          href={`/learner/tests/${test.testId}/attempt/${test.activeAttemptId}`}
        >
          Продолжить
        </Link>
      ) : attemptsLeft > 0 ? (
        <button
          type="button"
          className="ui-button"
          disabled={start.isPending}
          onClick={() => void onStart()}
        >
          {test.attemptsUsed === 0 ? 'Начать' : 'Пересдать'}
        </button>
      ) : null}
      {needsPreExamAuth ? (
        <div className="ui-stack" data-testid="pre-exam-auth-interstitial">
          <p className="ui-text-muted">
            Перед экзаменом нужно подтвердить личность (Приказ №816). Отправим ссылку на ваш e-mail
            — перейдите по ней, затем нажмите «{test.attemptsUsed === 0 ? 'Начать' : 'Пересдать'}»
            снова.
          </p>
          <button
            type="button"
            className="ui-button"
            disabled={requestLink.isPending}
            onClick={() => void onSendLink()}
          >
            Отправить ссылку для подтверждения
          </button>
          {requestLink.data?.delivered ? (
            <p className="ui-text-muted">Ссылка отправлена. Проверьте e-mail.</p>
          ) : null}
          {requestLink.error ? <SectionError message={requestLink.error} /> : null}
        </div>
      ) : start.error ? (
        <SectionError message={start.error} />
      ) : null}
    </li>
  );
}

export function TestsListScreen() {
  const { data, isLoading, error } = useMyTests();

  return (
    <PageContainer>
      <PageHeader title="Мои тесты" />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <SectionError message="Не удалось загрузить тесты" />
      ) : !data || data.length === 0 ? (
        <SectionEmpty message="Нет доступных тестов" />
      ) : (
        <SectionCard title="Доступные тесты">
          <ul className="ui-list">
            {data.map((t) => (
              <TestRow key={`${t.testId}:${t.enrollmentId}`} test={t} />
            ))}
          </ul>
        </SectionCard>
      )}
    </PageContainer>
  );
}
