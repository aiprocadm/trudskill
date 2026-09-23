'use client';

import { BlockedHint, DetailDrawer, DrawerCancelButton, blockedProps } from '@trudskill/ui';
import { useState } from 'react';

import { localToIso } from './format';
import { useTaskMutations } from './hooks';
import { StaffSelect } from './staff-select';
import { isFormDirty } from '../../lib/forms/dirty';
import { useAuth } from '../auth/context';

import type { StaffMember, TaskPriority } from './types';
import type { FormEvent, ReactElement } from 'react';

/**
 * `TPL-001` · постановка задачи (§5.4 МГ-G2.1): название, исполнители (по умолчанию — я),
 * срок, приоритет, метка, описание. Открывается панелью — список остаётся виден (`CMP-010`).
 * Срок в прошлом — предупреждение, не запрет (§5.4).
 */
export function TaskCreateDrawer({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}): ReactElement {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [label, setLabel] = useState('');
  const [assignees, setAssignees] = useState<StaffMember[]>([]);
  const [picked, setPicked] = useState('');
  const mutations = useTaskMutations();
  const { isPending } = mutations;

  const hasUnsavedChanges = isFormDirty(
    { title, description, dueAt, label, assignees: assignees.length },
    { title: '', description: '', dueAt: '', label: '', assignees: 0 }
  );
  const canSubmit = title.trim().length > 0;
  const dueInPast = dueAt !== '' && new Date(dueAt).getTime() < Date.now();

  const addAssignee = (userId: string, name: string) => {
    setPicked(userId);
    if (!userId || assignees.some((a) => a.id === userId)) return;
    setAssignees((prev) => [...prev, { id: userId, name }]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const due = localToIso(dueAt);
    const created = await mutations.create({
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(assignees.length > 0 ? { assigneeIds: assignees.map((a) => a.id) } : {}),
      ...(due ? { dueAt: due } : {}),
      priority,
      ...(label.trim() ? { label: label.trim() } : {})
    });
    if (created) onCreated();
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title="Новая задача"
      width="md"
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Название *</span>
          <input
            className="ui-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Позвонить заказчику по группе"
            maxLength={200}
            required
          />
        </label>

        <div className="ui-stack">
          <StaffSelect
            value={picked}
            onChange={addAssignee}
            label="Исполнитель"
            emptyLabel={session ? 'Я сам(а)' : '— не выбран —'}
          />
          {assignees.length > 0 ? (
            <ul className="ui-inline" aria-label="Выбранные исполнители">
              {assignees.map((member, index) => (
                <li key={member.id} className="ui-chip ui-chip--active">
                  {member.name || `Исполнитель ${index + 1}`}
                  <button
                    type="button"
                    className="ui-button"
                    aria-label="Убрать исполнителя"
                    onClick={() => setAssignees((prev) => prev.filter((a) => a.id !== member.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className="ui-field-hint">Без исполнителя задача ставится вам.</span>
          )}
        </div>

        <label className="ui-field">
          <span className="ui-field-label">Срок</span>
          <input
            className="ui-input"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
          {dueInPast ? (
            <span className="ui-field-hint">
              Срок уже прошёл — задача сразу будет просроченной.
            </span>
          ) : null}
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Приоритет</span>
          <select
            className="ui-select"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
          >
            <option value="low">Низкий</option>
            <option value="normal">Обычный</option>
            <option value="high">Высокий</option>
          </select>
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Метка</span>
          <input
            className="ui-input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Например: документы"
            maxLength={50}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Описание</span>
          <textarea
            className="ui-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={5000}
          />
        </label>

        {mutations.error ? (
          <p className="ui-field-error" role="alert">
            {mutations.error}
          </p>
        ) : null}

        <div className="ui-inline">
          <button
            type="submit"
            className={`ui-button ui-button--primary ${isPending ? 'ui-button--loading' : ''}`}
            disabled={isPending}
            {...blockedProps('task-title', canSubmit ? undefined : 'Назовите задачу')}
          >
            {/* TXT-002/TXT-003: подпись называет результат и не меняется по ходу. */}
            Поставить задачу
          </button>
          <DrawerCancelButton className="ui-button" onFallbackClose={onClose} />
        </div>
        <BlockedHint hintKey="task-title" reason={canSubmit ? undefined : 'Назовите задачу'} />
      </form>
    </DetailDrawer>
  );
}
