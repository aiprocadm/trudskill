'use client';

import { LoadingState, StatusChip } from '@trudskill/ui';
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
import { useCourseNames } from '../courses/course-picker';
import { useObjectCrumb } from '../navigation/use-object-crumb';

interface Props {
  assignmentId: string;
}

export function AssignmentDetailScreen({ assignmentId }: Props) {
  const assignment = useAssignment(assignmentId);
  useObjectCrumb(assignment.data?.title, { failed: Boolean(assignment.error) });
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
        toolsSlot={<StatusChip status={a.status} label={formatEntityStatus(a.status)} />}
        primaryAction={{ label: 'Редактировать', onSelect: () => setEditing(true) }}
        {...(!a.isArchived
          ? {
              secondaryActions: [
                {
                  label: 'Архивировать',
                  onSelect: () =>
                    void archive.mutate(assignmentId).then(() => void assignment.refetch()),
                  disabled: archive.isPending,
                  busy: archive.isPending
                }
              ]
            }
          : {})}
      />

      <SectionCard title="Параметры">
        <dl className="ui-defs">
          <dt>Максимальный балл</dt>
          <dd>{a.maxScore}</dd>
          <dt>Проверка преподавателем</dt>
          <dd>{a.isReviewRequired ? 'Да' : 'Нет'}</dd>
          <dt>Описание</dt>
          <dd>{a.description ?? '—'}</dd>
        </dl>
      </SectionCard>

      <SectionCard title="Практические работы">
        {/*
          §5.435: пояснение обещало «станут доступны позже» — обещание вместо объяснения, да
          ещё и устаревшее: сдача практических работ в продукте работает. Человеку нужен ответ
          на вопрос «почему пусто и что будет дальше», а не срок неизвестной поставки.
        */}
        <SectionEmpty
          message="Здесь появятся сданные работы"
          hint="Слушатель загружает файл в своём кабинете — после этого работа появляется здесь на проверку."
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
