'use client';

import { DataTable, FilterBar, LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import {
  completeMetricTimer,
  recordMetric,
  startMetricTimer
} from '../../lib/analytics/ux-metrics';
import { useAuth } from '../auth/context';
import {
  showActAsLearnerAction,
  showOpenLearnerRegistryAction
} from '../mvp/assessment-permissions';
import {
  useAssignmentReviews,
  useAssignmentSubmissions,
  useAssignments,
  useAttempts,
  useDomainMutations,
  useEnrollments,
  useExamResults,
  useQuestionBanks,
  useTests
} from '../mvp/hooks';
import { MutationError, readApiMessage, toTableRows } from '../mvp/screen-helpers';

import type { AssignmentSubmission, Attempt, ExamResult } from '../mvp/types';
import type { Column } from '@trudskill/ui';

/*
 * Перенесён «как есть» из features/mvp/screens.tsx (§8.3, порядок 4; правило SCR-001:
 * перенос и редизайн — разные шаги). Редизайн — следующим коммитом.
 */
const STATUS_OPTIONS = ['draft', 'active', 'archived'];

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'ожидает',
  active: 'активно',
  completed: 'завершено',
  suspended: 'приостановлено',
  cancelled: 'отменено',
  draft: 'черновик'
};

export const AssessmentDashboardScreen = () => {
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [attemptResult, setAttemptResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { startAttempt, getAttemptResult, completeAssignmentReview, updateAssignmentReview } =
    useDomainMutations();
  const {
    data: banks,
    loading: banksLoading,
    error: banksError
  } = useQuestionBanks({
    page: 1,
    page_size: 20,
    q,
    status
  });
  const {
    data: tests,
    loading: testsLoading,
    error: testsError
  } = useTests({
    page: 1,
    page_size: 20,
    q,
    status
  });
  const {
    data: assignments,
    loading: assignmentsLoading,
    error: assignmentsError
  } = useAssignments({
    page: 1,
    page_size: 20,
    group_id: groupId || undefined
  });
  const { data: enrollments } = useEnrollments({
    group_id: groupId || undefined,
    page: 1,
    page_size: 20
  });
  const { data: submissions } = useAssignmentSubmissions({
    page: 1,
    page_size: 50,
    status: 'submitted'
  });
  const {
    data: attempts,
    loading: attemptsLoading,
    error: attemptsError
  } = useAttempts({ page: 1, page_size: 20 });
  const {
    data: examResults,
    loading: examResultsLoading,
    error: examResultsError
  } = useExamResults({ page: 1, page_size: 20 });
  const { data: reviews } = useAssignmentReviews({ page: 1, page_size: 50 });
  const canCrossLearner = showOpenLearnerRegistryAction(session?.permissions);
  const canActAsLearner = showActAsLearnerAction(session?.permissions);

  const submissionColumns: Column<AssignmentSubmission>[] = [
    { key: 'id', title: 'Submission ID' },
    { key: 'assignmentId', title: 'Задание' },
    {
      key: 'learnerId',
      title: 'Слушатель и доступ',
      render: (row) => (
        <span className="ui-stack" style={{ gap: 4 }}>
          <code>{row.learnerId}</code>
          {canCrossLearner ? (
            <Link
              href="/learners"
              data-testid={`assessment-open-learner-sub-${row.id}`}
              title={`ID слушателя: ${row.learnerId}`}
            >
              Реестр слушателя
            </Link>
          ) : null}
          {canActAsLearner ? (
            <span className="ui-text-muted" data-testid={`assessment-act-as-learner-sub-${row.id}`}>
              Отметить за слушателя: запуск попытки / субмиты с learnerId этого зачисления (IAM:
              learners.act_as).
            </span>
          ) : null}
        </span>
      )
    },
    { key: 'status', title: 'Статус' },
    { key: 'submittedAt', title: 'Отправлено' }
  ];

  const attemptsColumns: Column<Attempt>[] = [
    { key: 'id', title: 'Попытка' },
    { key: 'testId', title: 'Тест' },
    { key: 'enrollmentId', title: 'Зачисление' },
    {
      key: 'learnerId',
      title: 'Слушатель и доступ',
      render: (row) => (
        <span className="ui-stack" style={{ gap: 4 }}>
          <code>{row.learnerId}</code>
          {canCrossLearner ? (
            <Link
              href="/learners"
              data-testid={`assessment-open-learner-att-${row.id}`}
              title={`ID слушателя: ${row.learnerId}`}
            >
              Реестр слушателя
            </Link>
          ) : null}
          {canActAsLearner ? (
            <span className="ui-text-muted" data-testid={`assessment-act-as-learner-att-${row.id}`}>
              Сценарий сдачи: выберите зачисление с этим learnerId.
            </span>
          ) : null}
        </span>
      )
    },
    { key: 'status', title: 'Статус' },
    { key: 'startedAt', title: 'Начато' }
  ];

  const examResultColumns: Column<ExamResult>[] = [
    { key: 'id', title: 'Результат' },
    { key: 'testId', title: 'Тест' },
    {
      key: 'learnerId',
      title: 'Слушатель и доступ',
      render: (row) => (
        <span className="ui-stack" style={{ gap: 4 }}>
          <code>{row.learnerId}</code>
          {canCrossLearner ? (
            <Link
              href="/learners"
              data-testid={`assessment-open-learner-exam-${row.id}`}
              title={`ID слушателя: ${row.learnerId}`}
            >
              Реестр слушателя
            </Link>
          ) : null}
          {canActAsLearner ? (
            <span
              className="ui-text-muted"
              data-testid={`assessment-act-as-learner-exam-${row.id}`}
            >
              Результат по строке; делегируйте мутации через актуальное зачисление слушателя.
            </span>
          ) : null}
        </span>
      )
    },
    { key: 'finalScore', title: 'Балл' },
    { key: 'passed', title: 'Зачёт' }
  ];

  const onStartAttempt = async () => {
    if (!selectedTestId || !selectedEnrollmentId || !session) {
      setSaveError('Выберите тест и зачисление');
      return;
    }
    const enrollmentRecord = enrollments?.items.find((e) => e.id === selectedEnrollmentId);
    if (!enrollmentRecord) {
      setSaveError('Не найдено выбранное зачисление (проверьте фильтр group_id)');
      return;
    }
    setSaveError(null);
    setAttemptResult(null);
    startMetricTimer('time_to_submit_assignment');
    try {
      const attempt = await startAttempt({
        testId: selectedTestId,
        enrollmentId: selectedEnrollmentId,
        learnerId: enrollmentRecord.learnerId
      });
      const result = await getAttemptResult(attempt.id);
      setAttemptResult(
        `Попытка ${attempt.id}: score=${result.finalScore}/${result.maxScore}, passed=${result.passed ? 'да' : 'нет'}`
      );
      completeMetricTimer('time_to_submit_assignment', { flow: 'assessment_attempt' });
    } catch (error) {
      setSaveError(readApiMessage(error));
      recordMetric('assignment_submit_dropoff', 1, { flow: 'assessment_attempt' });
    }
  };

  const flowStep = !selectedTestId ? 1 : !selectedEnrollmentId ? 2 : !attemptResult ? 3 : 4;

  return (
    <PageContainer>
      <PageHeader title="Оценивание и контроль знаний" />
      <SectionCard title="Фильтры">
        <FilterBar>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск" />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Все статусы</option>
            {STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            placeholder="Фильтр по group_id"
          />
        </FilterBar>
      </SectionCard>
      <SectionCard title="Банки вопросов">
        {banksLoading ? <LoadingState message="Загрузка банков вопросов..." /> : null}
        {banksError ? <SectionError message={banksError} /> : null}
        <p>Всего: {banks?.total ?? 0}</p>
        {banks?.items.length ? (
          <DataTable
            columns={[
              { key: 'code', title: 'Код' },
              { key: 'title', title: 'Название' }
            ]}
            rows={toTableRows(banks.items)}
          />
        ) : null}
      </SectionCard>
      <SectionCard title="Тесты">
        {testsLoading ? <LoadingState message="Загрузка тестов..." /> : null}
        {testsError ? <SectionError message={testsError} /> : null}
        <p>Всего: {tests?.total ?? 0}</p>
        {tests?.items.length ? (
          <>
            <DataTable
              columns={[
                { key: 'code', title: 'Код' },
                { key: 'title', title: 'Название' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={toTableRows(tests.items)}
            />
            <FilterBar>
              <select
                value={selectedTestId}
                onChange={(event) => setSelectedTestId(event.target.value)}
                aria-label="Выберите тест"
              >
                <option value="">Выберите тест для запуска попытки</option>
                {tests.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </FilterBar>
          </>
        ) : null}
      </SectionCard>
      <SectionCard title="Назначенные задания">
        {assignmentsLoading ? <LoadingState message="Загрузка назначений..." /> : null}
        {assignmentsError ? <SectionError message={assignmentsError} /> : null}
        <p>Всего: {assignments?.total ?? 0}</p>
        {assignments?.items.length ? (
          <DataTable
            columns={[
              { key: 'id', title: 'ID' },
              { key: 'testId', title: 'Тест' },
              { key: 'groupId', title: 'Группа' },
              { key: 'status', title: 'Статус' }
            ]}
            rows={toTableRows(assignments.items)}
          />
        ) : null}
      </SectionCard>
      <SectionCard title="Сценарий сдачи задания">
        <ol className="ui-stepper">
          <li className={`ui-step ${flowStep > 1 ? 'ui-step--done' : 'ui-step--active'}`}>
            1. Открыть задание
          </li>
          <li
            className={`ui-step ${
              flowStep > 2 ? 'ui-step--done' : flowStep === 2 ? 'ui-step--active' : ''
            }`}
          >
            2. Проверить данные
          </li>
          <li
            className={`ui-step ${
              flowStep > 3 ? 'ui-step--done' : flowStep === 3 ? 'ui-step--active' : ''
            }`}
          >
            3. Отправить
          </li>
          <li className={`ui-step ${flowStep === 4 ? 'ui-step--active' : ''}`}>4. Подтверждение</li>
        </ol>
        <FilterBar>
          <select
            value={selectedEnrollmentId}
            onChange={(event) => setSelectedEnrollmentId(event.target.value)}
            aria-label="Выберите зачисление"
          >
            <option value="">Выберите зачисление</option>
            {enrollments?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} ({ENROLLMENT_STATUS_LABEL[item.status] ?? item.status})
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void onStartAttempt()}>
            Запустить попытку и получить результат
          </button>
        </FilterBar>
        <MutationError message={saveError} />
        {attemptResult ? <p>{attemptResult}</p> : null}
        {attemptResult ? (
          <div className="ui-inline">
            <span className="ui-text-muted">Оцените удобство отправки:</span>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={() =>
                recordMetric('csat_after_submission', 5, { flow: 'assessment_attempt' })
              }
            >
              Хорошо
            </button>
            <button
              type="button"
              className="ui-button"
              onClick={() =>
                recordMetric('csat_after_submission', 2, { flow: 'assessment_attempt' })
              }
            >
              Нужно улучшить
            </button>
          </div>
        ) : null}
      </SectionCard>
      <SectionCard title="Попытки">
        {attemptsLoading ? <LoadingState message="Загрузка попыток…" /> : null}
        {attemptsError ? <SectionError message={attemptsError} /> : null}
        {!attemptsLoading && !attempts?.items?.length ? (
          <SectionEmpty message="Нет попыток в выборке" />
        ) : null}
        {attempts?.items.length ? (
          <DataTable<Attempt> columns={attemptsColumns} rows={attempts.items} />
        ) : null}
      </SectionCard>
      <SectionCard title="Результаты экзаменов">
        {examResultsLoading ? <LoadingState message="Загрузка результатов…" /> : null}
        {examResultsError ? <SectionError message={examResultsError} /> : null}
        {!examResultsLoading && !examResults?.items?.length ? (
          <SectionEmpty message="Нет результатов в выборке" />
        ) : null}
        {examResults?.items.length ? (
          <DataTable<ExamResult> columns={examResultColumns} rows={examResults.items} />
        ) : null}
      </SectionCard>
      <SectionCard title="Очередь проверок преподавателя">
        <p className="ui-text-muted">
          SLA проверки: 48 часов. Заявок в очереди: {submissions?.items.length ?? 0}
        </p>
        {submissions?.items.length ? (
          <DataTable<AssignmentSubmission> columns={submissionColumns} rows={submissions.items} />
        ) : (
          <SectionEmpty message="Новых submissions на проверку нет" />
        )}
      </SectionCard>
      <SectionCard title="Завершение проверок и SLA">
        {reviews?.items.length ? (
          <div className="ui-stack">
            {reviews.items.slice(0, 10).map((review) => (
              <div key={review.id} className="ui-inline">
                <StatusChip status={review.status} />
                <span>{review.id}</span>
                <button
                  type="button"
                  onClick={() =>
                    void completeAssignmentReview(review.id, {
                      score: review.score ?? 80,
                      comment: review.comment ?? 'Проверка завершена в рамках SLA'
                    }).catch((error) => setSaveError(readApiMessage(error)))
                  }
                  disabled={review.status === 'completed'}
                >
                  Завершить
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  onClick={() =>
                    void updateAssignmentReview(review.id, {
                      reviewStatus: 'in_review',
                      comment: `Апелляция зарегистрирована: ${new Date().toISOString()}`
                    }).catch((error) => setSaveError(readApiMessage(error)))
                  }
                >
                  Зарегистрировать апелляцию
                </button>
              </div>
            ))}
          </div>
        ) : (
          <SectionEmpty message="Проверки отсутствуют" />
        )}
      </SectionCard>
      <SectionCard title="История изменений оценивания">
        {reviews?.items.length ? (
          <DataTable
            columns={[
              { key: 'id', title: 'Review ID' },
              { key: 'status', title: 'Статус' },
              { key: 'score', title: 'Балл' },
              { key: 'comment', title: 'Комментарий' },
              { key: 'updatedAt', title: 'Обновлено' }
            ]}
            rows={toTableRows(reviews.items)}
          />
        ) : (
          <SectionEmpty message="История проверок пока пуста" />
        )}
      </SectionCard>
    </PageContainer>
  );
};
