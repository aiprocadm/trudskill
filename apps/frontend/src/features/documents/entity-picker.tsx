'use client';

import { useLearnersList } from '../learners/hooks';
import { useCoursesList, useEnrollments, useGroupsList } from '../mvp/hooks';

import type { ReactElement } from 'react';

/**
 * Для какого объекта выпускается документ.
 *
 * Раньше здесь было текстовое поле с подсказкой `entity_id`: администратор должен был
 * откуда-то взять идентификатор и вставить его руками. Теперь объект выбирается по имени.
 */
export type EntityType = 'course' | 'group' | 'learner' | 'enrollment';

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  course: 'Курс',
  group: 'Учебная группа',
  learner: 'Слушатель',
  enrollment: 'Зачисление слушателя'
};

const PAGE = { page: 1, page_size: 100 };

export const EntityPicker = ({
  entityType,
  value,
  onChange,
  groupId,
  onGroupIdChange
}: {
  entityType: EntityType;
  value: string;
  onChange: (id: string) => void;
  /** Для зачисления: сначала группа, потом слушатель внутри неё. */
  groupId: string;
  onGroupIdChange: (id: string) => void;
}): ReactElement => {
  const courses = useCoursesList(PAGE);
  const groups = useGroupsList(PAGE);
  const learners = useLearnersList({ page: 1, pageSize: 100 });
  const enrollments = useEnrollments(groupId ? { group_id: groupId } : { page: 1, page_size: 1 });

  const learnerName = new Map(
    (learners.data?.items ?? []).map((item) => [
      item.id,
      `${item.lastName} ${item.firstName}`.trim()
    ])
  );

  if (entityType === 'course') {
    return (
      <label className="ui-field">
        <span className="ui-field-label">Курс</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— выберите курс —</option>
          {(courses.data?.items ?? []).map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (entityType === 'group') {
    return (
      <label className="ui-field">
        <span className="ui-field-label">Учебная группа</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— выберите группу —</option>
          {(groups.data?.items ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.code})
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (entityType === 'learner') {
    return (
      <label className="ui-field">
        <span className="ui-field-label">Слушатель</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— выберите слушателя —</option>
          {(learners.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {`${item.lastName} ${item.firstName}`.trim()}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // Зачисление: их слишком много, чтобы показывать списком целиком, — сначала группа.
  return (
    <>
      <label className="ui-field">
        <span className="ui-field-label">Группа</span>
        <select
          value={groupId}
          onChange={(e) => {
            onGroupIdChange(e.target.value);
            onChange('');
          }}
        >
          <option value="">— выберите группу —</option>
          {(groups.data?.items ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.code})
            </option>
          ))}
        </select>
      </label>
      <label className="ui-field">
        <span className="ui-field-label">Слушатель в группе</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!groupId}>
          <option value="">{groupId ? '— выберите слушателя —' : 'сначала выберите группу'}</option>
          {(enrollments.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {learnerName.get(item.learnerId) ?? 'слушатель без имени в справочнике'}
            </option>
          ))}
        </select>
      </label>
    </>
  );
};
