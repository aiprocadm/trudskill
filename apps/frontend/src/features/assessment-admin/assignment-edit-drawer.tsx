'use client';

import { DetailDrawer } from '@trudskill/ui';
import { useState } from 'react';

import { useCreateAssignment, useUpdateAssignment } from './hooks';
import { isFormDirty } from '../../lib/forms/dirty';
import { CourseSelect } from '../courses/course-picker';
import { useModules } from '../mvp/hooks';

import type { AssignmentListItem } from './types';

interface Props {
  assignment?: AssignmentListItem | null;
  onClose: () => void;
  onSaved?: (a: AssignmentListItem) => void;
}

export function AssignmentEditDrawer({ assignment, onClose, onSaved }: Props) {
  const isEditing = Boolean(assignment);
  const [courseId, setCourseId] = useState(assignment?.courseId ?? '');
  const [moduleId, setModuleId] = useState(assignment?.moduleId ?? '');
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [description, setDescription] = useState(assignment?.description ?? '');
  const [maxScore, setMaxScore] = useState<string>(String(assignment?.maxScore ?? 100));
  const [isReviewRequired, setIsReviewRequired] = useState(assignment?.isReviewRequired ?? true);
  // CMP-010 (порция 28): закрытие с заполненными полями требует подтверждения.
  const hasUnsavedChanges = isFormDirty(
    { courseId, moduleId, title, description, maxScore, isReviewRequired },
    {
      courseId: assignment?.courseId ?? '',
      moduleId: assignment?.moduleId ?? '',
      title: assignment?.title ?? '',
      description: assignment?.description ?? '',
      maxScore: String(assignment?.maxScore ?? 100),
      isReviewRequired: assignment?.isReviewRequired ?? true
    }
  );

  const create = useCreateAssignment();
  const update = useUpdateAssignment();
  const modules = useModules();
  const isPending = create.isPending || update.isPending;
  const error = create.error || update.error;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const scoreNum = Number(maxScore);
    if (Number.isNaN(scoreNum) || scoreNum < 0) return;
    if (!title.trim()) return;
    if (!isEditing && !courseId.trim()) return;

    const result =
      isEditing && assignment
        ? await update.mutate(assignment.id, {
            title: title.trim(),
            ...(moduleId.trim() ? { moduleId: moduleId.trim() } : {}),
            ...(description.trim() ? { description: description.trim() } : {}),
            maxScore: scoreNum,
            isReviewRequired
          })
        : await create.mutate({
            courseId: courseId.trim(),
            title: title.trim(),
            ...(moduleId.trim() ? { moduleId: moduleId.trim() } : {}),
            ...(description.trim() ? { description: description.trim() } : {}),
            maxScore: scoreNum,
            isReviewRequired
          });
    if (result) onSaved?.(result);
  };

  /* Фаза 6 срез 7 (IA-001): самодельный aside → общий DetailDrawer с едиными состояниями. */
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={isEditing ? 'Редактирование задания' : 'Создание задания'}
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <form className="ui-form" onSubmit={submit}>
        {/* Курс просили ввести идентификатором — администратор его нигде не видит. */}
        {!isEditing && (
          <CourseSelect
            value={courseId}
            onChange={setCourseId}
            required
            hint="Задание получат слушатели этого курса."
          />
        )}

        {/* «ID модуля» просили текстом — теперь выбор по названию (необязательный). */}
        <label className="ui-field">
          <span>Модуль (необязательно)</span>
          <select
            className="ui-select"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
          >
            <option value="">Весь курс</option>
            {(modules.data?.items ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-field">
          <span>Название</span>
          <input
            type="text"
            className="ui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={255}
          />
        </label>

        <label className="ui-field">
          <span>Описание</span>
          <textarea
            className="ui-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>

        <label className="ui-field">
          <span>Максимальный балл</span>
          <input
            type="number"
            className="ui-input"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            min={0}
            step="any"
          />
        </label>

        <label className="ui-inline">
          <input
            type="checkbox"
            checked={isReviewRequired}
            onChange={(e) => setIsReviewRequired(e.target.checked)}
          />
          <span>Требуется проверка преподавателем</span>
        </label>

        {error ? <p className="ui-field-error">{error}</p> : null}

        <div className="ui-form-actions">
          <button type="button" className="ui-button" onClick={onClose} disabled={isPending}>
            Отмена
          </button>
          <button
            type="submit"
            className={`ui-button-primary ${isPending ? 'ui-button--loading' : ''}`}
            disabled={isPending || !title.trim()}
          >
            Сохранить задание
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}
