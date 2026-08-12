'use client';

import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { LearnerPdfCardSections } from '../learner-pdf-card/learner-pdf-card-sections';
import { useLearner, useLearnerCourses } from '../mvp/hooks';

/*
 * Перенесён «как есть» из features/mvp/screens.tsx (§8.3, порядок 1; правило SCR-001:
 * перенос и редизайн — разные шаги). Редизайн карточки под TPL-002 — следующий срез.
 */
export const LearnerDetailsScreen = ({ id }: { id: string }) => {
  const { data: learner, loading, error, refetch } = useLearner(id);
  const { data: enrollmentPage, loading: enrollmentsLoading } = useLearnerCourses(id);
  const enrollments = enrollmentPage?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Карточка слушателя"
        actions={<Link href="/learners">← Реестр слушателей</Link>}
      />
      {loading ? <LoadingState message="Загрузка…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void refetch()} /> : null}
      {learner ? (
        <>
          <SectionCard title="Основные данные">
            <div className="ui-inline" style={{ justifyContent: 'space-between' }}>
              <div>
                <p className="profile-name">{`${learner.lastName} ${learner.firstName}`.trim()}</p>
                <p className="ui-text-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                  ID: {learner.id}
                </p>
              </div>
              <StatusChip status={learner.status} />
            </div>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Код (learnerNo)</dt>
                <dd>{learner.learnerNo ?? '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Email</dt>
                <dd>{learner.email ?? '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Подразделение</dt>
                <dd>{learner.organizationUnitId ?? '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Связанный IAM user</dt>
                <dd>{learner.linkedIamUserId ?? '—'}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Зачисления">
            {enrollmentsLoading ? <LoadingState message="Загрузка зачислений…" /> : null}
            {!enrollmentsLoading && enrollments.length === 0 ? (
              <SectionEmpty message="Нет зачислений для этого слушателя" />
            ) : null}
            {!enrollmentsLoading && enrollments.length > 0 ? (
              <DataTable
                columns={[
                  { key: 'courseId', title: 'Курс (id)' },
                  { key: 'groupId', title: 'Группа' },
                  { key: 'status', title: 'Статус' },
                  { key: 'enrolledAt', title: 'Зачислен' }
                ]}
                rows={enrollments.map((e) => ({
                  courseId: e.courseId ?? '—',
                  groupId: e.groupId,
                  status: e.status,
                  enrolledAt: e.enrolledAt
                }))}
              />
            ) : null}
          </SectionCard>
          {/* Pillar A Plan C §5.11 — личное дело: учебная история + документы + PDF stub */}
          <LearnerPdfCardSections learnerId={id} />
        </>
      ) : null}
    </PageContainer>
  );
};
