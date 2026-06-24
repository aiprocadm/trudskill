'use client';

import { LoadingState } from '@cdoprof/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  detectStartGate,
  formatAttemptsLeft,
  formatLearnerTestStatus,
  formatScoreLine
} from './format';
import { useMyTests, useRequestPreExamToken, useStartAttempt } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { ProctoringStartPanel } from '../proctoring/screens';

import type { LearnerTestSummary } from './types';

function TestRow({ test }: { test: LearnerTestSummary }) {
  const router = useRouter();
  const start = useStartAttempt();
  const requestLink = useRequestPreExamToken();
  const attemptsLeft = test.attemptLimit - test.attemptsUsed;

  // Gate detection extracted to detectStartGate (format.ts) — messages are designed non-colliding.
  const gate = detectStartGate(start.error);
  const needsPreExamAuth = gate === 'pre_exam_auth';
  const needsIdentityVerification = gate === 'identity_verification';
  const needsProctoring = gate === 'proctoring';

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
    <li className="entry-card">
      <span className="ui-list-title">{test.title}</span>
      <span>{formatLearnerTestStatus(test.status)}</span>
      <span>{formatAttemptsLeft(test.attemptsUsed, test.attemptLimit)}</span>
      {test.bestScore !== undefined ? (
        <span>Лучший результат: {formatScoreLine(test.bestScore, test.maxScore)}</span>
      ) : null}
      {test.activeAttemptId ? (
        <Link
          className="ui-button ui-button--primary"
          href={`/learner/tests/${test.testId}/attempt/${test.activeAttemptId}`}
        >
          Продолжить
        </Link>
      ) : attemptsLeft > 0 ? (
        <button
          type="button"
          className="ui-button ui-button--primary"
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
      ) : needsIdentityVerification ? (
        <div className="ui-stack" data-testid="identity-verification-interstitial">
          <p className="ui-text-muted">
            Перед экзаменом нужно подтвердить личность (селфи + паспорт).
          </p>
          <Link className="ui-button" href="/learner/identity">
            Подтвердить личность
          </Link>
        </div>
      ) : needsProctoring ? (
        <div className="ui-stack" data-testid="proctoring-interstitial">
          <p className="ui-text-muted">
            Этот экзамен записывается на видео (прокторинг). Включите камеру, дайте согласие и
            нажмите «Начать запись и экзамен».
          </p>
          <ProctoringStartPanel
            enrollmentId={test.enrollmentId}
            courseId={test.courseId}
            onRecordingStarted={() => void onStart()}
          />
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
