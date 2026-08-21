'use client';

import { Icon, LoadingState } from '@trudskill/ui';
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
import { CheckCircleIcon, CircleXIcon } from '../navigation/nav-icons';

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
        <SectionEmpty
          message="Результата пока нет"
          hint="Он появляется после завершения попытки. Если в тесте есть развёрнутые ответы, итог станет известен после проверки преподавателем."
        />
      ) : (
        <div className="ui-stack">
          <div
            className={`test-result__banner test-result__banner--${
              result.passed ? 'pass' : 'fail'
            }`}
          >
            {/*
              UI-024: значок — иконка набора, а не символ. Здесь он декоративный
              (aria-hidden): рядом стоит заголовок «Тест пройден / не пройден», и
              дублировать его голосом незачем.
            */}
            <span className="test-result__icon" aria-hidden>
              <Icon icon={result.passed ? CheckCircleIcon : CircleXIcon} size={24} />
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
