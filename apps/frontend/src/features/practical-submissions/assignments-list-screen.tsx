'use client';

import { LoadingState } from '@trudskill/ui';
import Link from 'next/link';

import { formatSubmissionStatus } from './format';
import { useMyAssignments } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { LearnerAssignmentSummary } from './types';

function AssignmentRow({ assignment }: { assignment: LearnerAssignmentSummary }) {
  return (
    <li className="entry-card">
      <span className="ui-list-title">{assignment.title}</span>
      <span>{formatSubmissionStatus(assignment.status)}</span>
      <Link
        className="ui-button ui-button--primary"
        href={`/learner/assignments/${assignment.assignmentId}/submit`}
      >
        {assignment.status === 'not_started' ? 'Сдать' : 'Открыть'}
      </Link>
    </li>
  );
}

export function AssignmentsListScreen() {
  const { data, isLoading, error, refetch } = useMyAssignments();

  return (
    <PageContainer>
      <PageHeader title="Мои задания" subtitle="Практические работы по вашим курсам" />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <SectionError
          message={error instanceof Error ? error.message : 'Ошибка загрузки'}
          onRetry={() => void refetch()}
        />
      ) : !data || data.length === 0 ? (
        <SectionEmpty
          message="Нет доступных заданий"
          hint="Задания появятся после зачисления на курс."
        />
      ) : (
        <SectionCard title="Доступные задания">
          <ul className="ui-list">
            {data.map((a) => (
              <AssignmentRow key={`${a.assignmentId}:${a.enrollmentId}`} assignment={a} />
            ))}
          </ul>
        </SectionCard>
      )}
    </PageContainer>
  );
}
