'use client';

import { LoadingState, StatusChip } from '@cdoprof/ui';
import { useState } from 'react';

import { AssignmentEditDrawer } from './assignment-edit-drawer';
import { formatEntityStatus } from './format';
import { useArchiveAssignment, useAssignment } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

interface Props {
  assignmentId: string;
}

export function AssignmentDetailScreen({ assignmentId }: Props) {
  const assignment = useAssignment(assignmentId);
  const archive = useArchiveAssignment();
  const [editing, setEditing] = useState(false);

  if (assignment.isLoading) return <LoadingState message="Загрузка задания…" />;
  if (assignment.error || !assignment.data) {
    return (
      <SectionError
        message={
          assignment.error instanceof Error ? assignment.error.message : 'Задание не найдено'
        }
        onRetry={() => void assignment.refetch()}
      />
    );
  }
  const a = assignment.data;

  return (
    <PageContainer>
      <PageHeader
        title={a.title}
        subtitle={`Курс ${a.courseId}${a.moduleId ? ` · модуль ${a.moduleId}` : ''}`}
        actions={
          <>
            <button type="button" className="ui-button" onClick={() => setEditing(true)}>
              Редактировать
            </button>
            {!a.isArchived && (
              <button
                type="button"
                className="ui-button"
                onClick={() =>
                  void archive.mutate(assignmentId).then(() => void assignment.refetch())
                }
                disabled={archive.isPending}
              >
                {archive.isPending ? 'Архивация…' : 'Архивировать'}
              </button>
            )}
            <StatusChip status={formatEntityStatus(a.status)} />
          </>
        }
      />

      <SectionCard title="Параметры">
        <dl className="ui-defs">
          <dt>Максимальный балл</dt>
          <dd>{a.maxScore}</dd>
          <dt>Требуется ревью</dt>
          <dd>{a.isReviewRequired ? 'Да' : 'Нет'}</dd>
          <dt>Описание</dt>
          <dd>{a.description ?? '—'}</dd>
        </dl>
      </SectionCard>

      <SectionCard title="Submissions">
        <SectionEmpty
          message="Раздел будет доступен после Plan C"
          hint="Plan C добавит загрузку файлов и manual review."
        />
      </SectionCard>

      {editing && (
        <AssignmentEditDrawer
          assignment={a}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void assignment.refetch();
          }}
        />
      )}
    </PageContainer>
  );
}
