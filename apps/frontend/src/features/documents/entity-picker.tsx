'use client';

import { CourseSelect } from '../courses/course-picker';
import { GroupSelect } from '../groups/group-picker';
import { LearnerSelect, useLearnerNames } from '../learners/learner-picker';
import { useEnrollments } from '../mvp/hooks';

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
  const enrollments = useEnrollments(groupId ? { group_id: groupId } : { page: 1, page_size: 1 });
  const learnerName = useLearnerNames();

  /*
   * Три ветви рисовали свои списки поверх одной страницы справочника — и повторяли то,
   * что уже умеют общие выборщики. Теперь берутся они: поиск на сервере и честные числа
   * достаются даром, а дублирования нет (журнал 392).
   */
  if (entityType === 'course') {
    return <CourseSelect value={value} onChange={onChange} label="Курс" />;
  }

  if (entityType === 'group') {
    return (
      <GroupSelect
        value={value}
        onChange={onChange}
        label="Учебная группа"
        emptyLabel="— выберите группу —"
      />
    );
  }

  if (entityType === 'learner') {
    return <LearnerSelect value={value} onChange={onChange} label="Слушатель" />;
  }

  // Зачисление: их слишком много, чтобы показывать списком целиком, — сначала группа.
  return (
    <>
      <GroupSelect
        value={groupId}
        onChange={(next) => {
          onGroupIdChange(next);
          onChange('');
        }}
        label="Группа"
        emptyLabel="— выберите группу —"
      />
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
