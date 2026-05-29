'use client';

import { useState } from 'react';

import { useCreateAssignment, useUpdateAssignment } from './hooks';

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

  const create = useCreateAssignment();
  const update = useUpdateAssignment();
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

  return (
    <aside
      className="ui-drawer"
      role="dialog"
      aria-label={isEditing ? 'Редактирование задания' : 'Создание задания'}
    >
      <header className="ui-drawer-header">
        <h2>{isEditing ? 'Редактирование задания' : 'Создание задания'}</h2>
        <button type="button" className="ui-button-ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>

      <form className="ui-form" onSubmit={submit}>
        {!isEditing && (
          <label className="ui-field">
            <span>ID курса</span>
            <input
              type="text"
              className="ui-input"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              maxLength={64}
            />
          </label>
        )}

        <label className="ui-field">
          <span>ID модуля (опционально)</span>
          <input
            type="text"
            className="ui-input"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            maxLength={64}
          />
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
          <span>Требуется ревью</span>
        </label>

        {error ? <p className="ui-field-error">{error}</p> : null}

        <div className="ui-form-actions">
          <button type="button" className="ui-button" onClick={onClose} disabled={isPending}>
            Отмена
          </button>
          <button type="submit" className="ui-button-primary" disabled={isPending || !title.trim()}>
            {isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </aside>
  );
}
