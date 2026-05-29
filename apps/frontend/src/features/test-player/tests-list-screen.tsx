'use client';

import { LoadingState } from '@cdoprof/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { formatAttemptsLeft, formatLearnerTestStatus, formatScoreLine } from './format';
import { useMyTests, useStartAttempt } from './hooks';
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
  const attemptsLeft = test.attemptLimit - test.attemptsUsed;

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
      {start.error ? <SectionError message={start.error} /> : null}
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
