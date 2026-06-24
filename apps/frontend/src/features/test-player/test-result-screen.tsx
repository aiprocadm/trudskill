'use client';

import { LoadingState } from '@cdoprof/ui';
import Link from 'next/link';

import { formatScoreLine } from './format';
import { useAttempt, useAttemptResult } from './hooks';
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
  const { data: attempt } = useAttempt(attemptId || null);

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
        <div className="ui-stack">
          <div
            className={`test-result__banner test-result__banner--${
              result.passed ? 'pass' : 'fail'
            }`}
          >
            <span className="test-result__icon" aria-hidden>
              {result.passed ? '✓' : '✕'}
            </span>
            <div>
              <h2 className="test-result__headline">
                {result.passed ? 'Тест пройден' : 'Тест не пройден'}
              </h2>
              <p className="test-result__score">
                Набрано баллов:{' '}
                <strong>{formatScoreLine(result.finalScore, result.maxScore)}</strong>
              </p>
            </div>
          </div>
          <SectionCard title="Подробности">
            {attempt?.identityVerifiedAt ? (
              <p className="ui-callout ui-callout--success">Личность подтверждена ✓</p>
            ) : null}
            <p>Попыток: {result.attemptsCount}</p>
            <p className="ui-text-muted">
              Развёрнутые ответы (эссе) при наличии проверит преподаватель — результат может
              измениться.
            </p>
            <Link className="ui-button ui-button--primary" href="/learner/tests">
              Назад к тестам
            </Link>
          </SectionCard>
        </div>
      )}
    </PageContainer>
  );
}
