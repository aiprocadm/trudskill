'use client';

import {
  BlockedHint,
  DataTable,
  FilterBar,
  StatusChip,
  WizardSteps,
  blockedProps
} from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  ATTEMPT_STATUS_LABELS,
  CATALOG_STATUS_LABELS,
  CATALOG_STATUS_OPTIONS,
  REVIEW_STATUS_LABELS,
  attemptResultText,
  statusLabel
} from './labels';
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
import { useLearnersList } from '../learners/hooks';
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
  useGroupsList,
  useTests
} from '../mvp/hooks';
import { MutationError, formatDate, readApiMessage } from '../mvp/screen-helpers';

const PAGE = { page: 1, page_size: 100 };

const ATTEMPT_STEPS = [
  { id: 'test', title: 'Тест' },
  { id: 'learner', title: 'Слушатель' },
  { id: 'result', title: 'Результат' }
];

/*
 * Волна 2 §8.1 (Фаза 4, срез 8). Что изменилось против перенесённой версии:
 *
 * 1. **Было девять блоков подряд** при бюджете «≤3 до сгиба»: фильтры, банки вопросов,
 *    тесты, назначенные задания, сценарий сдачи, попытки, результаты, очередь проверок,
 *    завершение проверок, история. Три из них — банки, тесты и задания — просто повторяли
 *    содержимое СВОИХ экранов (`/admin/question-banks`, `/admin/tests`, `/admin/assignments`)
 *    в виде таблиц только для чтения. Убраны, вместо них ссылки на эти экраны.
 * 2. **Ни одной фамилии на экране.** Слушатель, тест, задание и зачисление показывались
 *    идентификаторами: `<code>3f7a…</code>`, «Submission ID», «Review ID», а зачисление
 *    в выпадающем списке выбиралось по идентификатору (журнал, запись 39).
 * 3. Пояснения были написаны для разработчика: «запуск попытки / субмиты с learnerId этого
 *    зачисления (IAM: learners.act_as)».
 * 4. Результат попытки печатался машинной строкой `score=8/10, passed=да`.
 * 5. Шаги сценария — своя копия разметки степпера; теперь общий `WizardSteps` (запись 36).
 */
export const AssessmentDashboardScreen = () => {
  const { session } = useAuth();
  const [status, setStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');

  /*
   * ТЗ 5.8 (Э8): называем недостающее поимённо. «Выберите тест и слушателя» вместо молчания;
   * когда не хватает одного из двух — говорим, какого именно.
   */
  const conductBlockedReason = !selectedTestId
    ? !selectedEnrollmentId
      ? 'Выберите тест и слушателя.'
      : 'Выберите тест.'
    : !selectedEnrollmentId
      ? 'Выберите слушателя.'
      : undefined;
  const [attemptResult, setAttemptResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { startAttempt, getAttemptResult, completeAssignmentReview, updateAssignmentReview } =
    useDomainMutations();

  const { data: tests } = useTests({ ...PAGE, status });
  const { data: assignments } = useAssignments({
    ...PAGE,
    ...(groupId ? { group_id: groupId } : {})
  });
  const { data: enrollments } = useEnrollments({
    ...PAGE,
    ...(groupId ? { group_id: groupId } : {})
  });
  const { data: submissions, error: submissionsError } = useAssignmentSubmissions({
    ...PAGE,
    status: 'submitted'
  });
  const { data: attempts, error: attemptsError } = useAttempts(PAGE);
  const { data: examResults, error: examResultsError } = useExamResults(PAGE);
  const { data: reviews } = useAssignmentReviews(PAGE);
  const { data: groups } = useGroupsList(PAGE);
  const { data: learners } = useLearnersList({ page: 1, pageSize: 100 });

  const canOpenLearner = showOpenLearnerRegistryAction(session?.permissions);
  const canActAsLearner = showActAsLearnerAction(session?.permissions);

  const learnerName = useMemo(
    () =>
      new Map(
        (learners?.items ?? []).map((item) => [
          item.id,
          `${item.lastName} ${item.firstName}`.trim()
        ])
      ),
    [learners]
  );
  const testTitle = useMemo(
    () => new Map((tests?.items ?? []).map((item) => [item.id, item.title])),
    [tests]
  );
  const assignmentTitle = useMemo(
    () => new Map((assignments?.items ?? []).map((item) => [item.id, item.title])),
    [assignments]
  );

  /** Слушатель — имя, и ссылка на карточку, если право разрешает выходить за своего. */
  const learnerCell = (learnerId: string) => {
    const name = learnerName.get(learnerId) ?? 'нет в справочнике';
    return canOpenLearner ? (
      <Link className="ui-link" href={`/learners/${learnerId}`}>
        {name}
      </Link>
    ) : (
      name
    );
  };

  const onStartAttempt = async () => {
    if (!selectedTestId || !selectedEnrollmentId || !session) {
      setSaveError('Выберите тест и слушателя');
      return;
    }
    const enrollmentRecord = enrollments?.items.find((e) => e.id === selectedEnrollmentId);
    if (!enrollmentRecord) {
      setSaveError('Выбранное зачисление не найдено — проверьте, та ли выбрана группа');
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
      setAttemptResult(attemptResultText(result.finalScore, result.maxScore, result.passed));
      completeMetricTimer('time_to_submit_assignment', { flow: 'assessment_attempt' });
    } catch (error) {
      setSaveError(readApiMessage(error));
      recordMetric('assignment_submit_dropoff', 1, { flow: 'assessment_attempt' });
    }
  };

  const currentStep = !selectedTestId ? 'test' : !selectedEnrollmentId ? 'learner' : 'result';

  return (
    <PageContainer>
      <PageHeader
        title="Оценивание"
        subtitle="Что требует проверки, как идут попытки и чем закончились экзамены"
        secondaryActions={[{ label: 'Тесты и банки вопросов', href: '/admin/tests' }]}
      />

      <FilterBar
        onReset={() => {
          setStatus('');
          setGroupId('');
        }}
        activeCount={[status, groupId].filter(Boolean).length}
        primary={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Учебная группа</span>
              <select
                value={groupId}
                onChange={(event) => {
                  setGroupId(event.target.value);
                  setSelectedEnrollmentId('');
                }}
              >
                <option value="">Все группы</option>
                {(groups?.items ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Состояние теста</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Любое</option>
                {CATALOG_STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(CATALOG_STATUS_LABELS, item)}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      <SectionCard title="Ждут проверки преподавателя">
        <p className="ui-hint">
          Срок проверки — двое суток с момента отправки. Сейчас в очереди:{' '}
          {submissions?.items.length ?? 0}.
        </p>
        {submissionsError ? <SectionError message={submissionsError} /> : null}
        {submissions?.items.length ? (
          <DataTable
            columns={[
              { key: 'learner', title: 'Слушатель' },
              { key: 'assignment', title: 'Задание' },
              { key: 'submitted', title: 'Отправлено' }
            ]}
            rows={submissions.items.map((item) => ({
              learner: learnerCell(item.learnerId),
              assignment: assignmentTitle.get(item.assignmentId) ?? 'задание не найдено',
              submitted: formatDate(item.submittedAt)
            }))}
          />
        ) : (
          <SectionEmpty
            message="Проверять пока нечего"
            hint="Сюда попадают работы слушателей сразу после отправки — они ждут оценки преподавателя."
          />
        )}
        {canActAsLearner ? (
          <p className="ui-hint">
            У вас есть право действовать от лица слушателя: запускать попытку и отправлять работу за
            него. Такое действие помечается в журнале как выполненное по поручению.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Провести тест за слушателя">
        <WizardSteps steps={ATTEMPT_STEPS} currentId={currentStep} label="Шаги сдачи теста" />
        <div className="ui-inline">
          <label className="ui-field">
            <span className="ui-field-label">Тест</span>
            <select
              value={selectedTestId}
              onChange={(event) => setSelectedTestId(event.target.value)}
            >
              <option value="">— выберите тест —</option>
              {(tests?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Слушатель</span>
            {/* Раньше здесь стоял список зачислений, подписанных идентификаторами. */}
            <select
              value={selectedEnrollmentId}
              onChange={(event) => setSelectedEnrollmentId(event.target.value)}
            >
              <option value="">— выберите слушателя —</option>
              {(enrollments?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {learnerName.get(item.learnerId) ?? 'нет в справочнике'}
                </option>
              ))}
            </select>
          </label>
          {/*
            ТЗ 5.8 (Э8): кнопка была выключена молча. Два списка рядом, и какой из них не
            заполнен — человек угадывал (журнал 465).
          */}
          <button
            type="button"
            className="ui-button--primary"
            onClick={() => void onStartAttempt()}
            {...blockedProps('conduct-test', conductBlockedReason)}
          >
            Провести тест
          </button>
        </div>
        <BlockedHint hintKey="conduct-test" reason={conductBlockedReason} />
        <MutationError message={saveError} />
        {attemptResult ? (
          <>
            <p className="ui-callout ui-callout--success">{attemptResult}</p>
            <div className="ui-inline">
              <span className="ui-text-muted">Насколько удобно прошло?</span>
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() =>
                  recordMetric('csat_after_submission', 5, { flow: 'assessment_attempt' })
                }
              >
                Удобно
              </button>
              <button
                type="button"
                className="ui-button"
                onClick={() =>
                  recordMetric('csat_after_submission', 2, { flow: 'assessment_attempt' })
                }
              >
                Есть что улучшить
              </button>
            </div>
          </>
        ) : null}
      </SectionCard>

      <SectionCard title="Попытки и результаты">
        {attemptsError ? <SectionError message={attemptsError} /> : null}
        {examResultsError ? <SectionError message={examResultsError} /> : null}
        <h3 className="ui-subheading">Идущие и завершённые попытки</h3>
        {attempts?.items.length ? (
          <DataTable
            columns={[
              { key: 'learner', title: 'Слушатель' },
              { key: 'test', title: 'Тест' },
              { key: 'state', title: 'Статус' },
              { key: 'started', title: 'Начата' }
            ]}
            rows={attempts.items.map((item) => ({
              learner: learnerCell(item.learnerId),
              test: testTitle.get(item.testId) ?? 'тест не найден',
              state: statusLabel(ATTEMPT_STATUS_LABELS, item.status),
              started: formatDate(item.startedAt)
            }))}
          />
        ) : (
          <SectionEmpty
            message="Попыток пока не было"
            hint="Попытка появляется, когда слушатель начинает тест — сам или под руководством преподавателя."
          />
        )}
        <h3 className="ui-subheading">Итоги экзаменов</h3>
        {examResults?.items.length ? (
          <DataTable
            columns={[
              { key: 'learner', title: 'Слушатель' },
              { key: 'test', title: 'Тест' },
              { key: 'score', title: 'Балл' },
              { key: 'result', title: 'Итог' }
            ]}
            rows={examResults.items.map((item) => ({
              learner: learnerCell(item.learnerId),
              test: testTitle.get(item.testId) ?? 'тест не найден',
              score: `${item.finalScore} из ${item.maxScore}`,
              result: item.passed ? 'Зачёт' : 'Не зачтено'
            }))}
          />
        ) : (
          <SectionEmpty
            message="Итогов экзаменов пока нет"
            hint="Итог появляется, когда слушатель завершает экзамен и работа проверена."
          />
        )}
      </SectionCard>

      <SectionCard title="Проверки преподавателя">
        {reviews?.items.length ? (
          <DataTable
            columns={[
              { key: 'learner', title: 'Слушатель' },
              { key: 'state', title: 'Статус', render: (row) => row.state },
              { key: 'score', title: 'Балл' },
              { key: 'comment', title: 'Комментарий' },
              { key: 'updated', title: 'Изменено' }
            ]}
            rows={reviews.items.map((item) => ({
              id: item.id,
              learner: assignmentTitle.get(item.assignmentId) ?? 'задание не найдено',
              state: (
                <StatusChip
                  status={item.status}
                  label={statusLabel(REVIEW_STATUS_LABELS, item.status)}
                />
              ),
              score: item.score ?? '—',
              comment: item.comment ?? '—',
              updated: formatDate(item.updatedAt)
            }))}
            rowKey={(row) => String(row.id)}
            rowActions={(row) => {
              const review = reviews.items.find((item) => item.id === row.id);
              if (!review || review.status === 'completed') return [];
              return [
                {
                  label: 'Завершить проверку',
                  onSelect: () =>
                    void completeAssignmentReview(review.id, {
                      score: review.score ?? 80,
                      comment: review.comment ?? 'Проверка завершена в срок'
                    }).catch((error) => setSaveError(readApiMessage(error)))
                },
                {
                  label: 'Принять апелляцию',
                  onSelect: () =>
                    void updateAssignmentReview(review.id, {
                      reviewStatus: 'in_review',
                      comment: 'Слушатель подал апелляцию — работа возвращена на проверку'
                    }).catch((error) => setSaveError(readApiMessage(error)))
                }
              ];
            }}
          />
        ) : (
          <SectionEmpty
            message="Проверок пока не было"
            hint="Здесь видно, что проверено, с каким баллом и когда."
          />
        )}
      </SectionCard>
    </PageContainer>
  );
};
