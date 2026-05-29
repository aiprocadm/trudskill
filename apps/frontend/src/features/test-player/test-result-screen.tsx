'use client';

import { LoadingState } from '@cdoprof/ui';
import Link from 'next/link';

import { formatScoreLine } from './format';
import { useAttemptResult } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

interface TestResultScreenProps {
  testId: string;
  attemptId: string;
}

export function TestResultScreen({ attemptId }: TestResultScreenProps) {
  const { data: result, isLoading, error } = useAttemptResult(attemptId || null);

  return (
    <PageContainer>
      <PageHeader title="Результат теста" />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <SectionError message="Не удалось загрузить результат" />
      ) : !result ? (
        <SectionEmpty message="Результат недоступен" />
      ) : (
        <SectionCard title={result.passed ? 'Тест пройден' : 'Тест не пройден'}>
          <p>Баллы: {formatScoreLine(result.finalScore, result.maxScore)}</p>
          <p>Попыток: {result.attemptsCount}</p>
          <p>
            Развёрнутые ответы (эссе) при наличии проверит преподаватель — результат может
            измениться.
          </p>
          <Link className="ui-button" href="/learner/tests">
            Назад к тестам
          </Link>
        </SectionCard>
      )}
    </PageContainer>
  );
}
