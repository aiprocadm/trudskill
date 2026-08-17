'use client';

import { LoadingState, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import { AssignmentEditDrawer } from './assignment-edit-drawer';
import { formatEntityStatus } from './format';
import { useArchiveAssignment, useAssignment } from './hooks';
import { useCourseNames } from '../courses/course-picker';
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
  const courseNames = useCourseNames();
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
        subtitle={
          /* Название курса вместо сырого courseId; идентификатор модуля человеку не говорит
             ничего — упоминаем только сам факт привязки (справочника имён модулей в API нет). */
          `${courseNames.get(a.courseId) ? `Курс «${courseNames.get(a.courseId)}»` : 'Задание курса'}${a.moduleId ? ' · привязано к модулю' : ''}`
        }
        actions={
          <>
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => setEditing(true)}
            >
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

      <SectionCard title="Практические работы">
        <SectionEmpty
          message="Здесь появятся сданные работы"
          hint="Загрузка файлов и проверка работ станут доступны позже."
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
