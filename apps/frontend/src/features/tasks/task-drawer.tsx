'use client';

import {
  BlockedHint,
  DetailDrawer,
  StatusChip,
  blockedProps,
  useConfirmDialog
} from '@trudskill/ui';
import { useState } from 'react';

import { formatAssignees, formatDue, formatLinks, isoToLocal, localToIso } from './format';
import { useTaskComments, useTaskMutations } from './hooks';
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE } from './types';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';

import type { Task, TaskTransition } from './types';
import type { ReactElement } from 'react';

/**
 * Карточка задачи панелью (`CMP-010`, МГ-L6.1): что, кому, к какому сроку — и действия по роли
 * актора (§5.4 МГ-G2.2). Исполнитель: «Взять в работу» → «Выполнить». Постановщик (или
 * `tasks.manage_all`): «Подтвердить», «Вернуть» (комментарий обязателен), «Отменить»,
 * «Перенести». Подписи не меняются по ходу (`TXT-003`); отмена — через `ConfirmDialog` с
 * названием задачи (`МГ-L2.1`).
 */
export function TaskDrawer({
  task,
  onClose,
  onChanged
}: {
  task: Task;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const permissions = session?.permissions ?? [];
  const canWrite = hasPermission(permissions, 'tasks.write');
  const manageAll = hasPermission(permissions, 'tasks.manage_all');
  const isAuthor = task.creatorUserId === userId || manageAll;
  const isAssignee = task.assignees.some((a) => a.userId === userId);
  const isOpen = task.status === 'new' || task.status === 'in_progress' || task.status === 'done';

  const mutations = useTaskMutations();
  const { isPending } = mutations;
  const comments = useTaskComments(task.id);
  const { ask, dialog } = useConfirmDialog();
  const [commentText, setCommentText] = useState('');
  const [returnText, setReturnText] = useState('');
  const [returning, setReturning] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDue, setNewDue] = useState(isoToLocal(task.dueAt));

  const run = async (transition: TaskTransition, comment?: string) => {
    const result = await mutations.transition(task.id, transition, comment);
    if (result) onChanged();
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    const added = await mutations.addComment(task.id, commentText.trim());
    if (added) {
      setCommentText('');
      void comments.refetch();
    }
  };

  const submitReturn = async () => {
    if (!returnText.trim()) return;
    await run('return', returnText.trim());
    setReturning(false);
    setReturnText('');
  };

  const submitReschedule = async () => {
    const due = localToIso(newDue);
    if (!due) return;
    const result = await mutations.reschedule(task.id, { dueAt: due });
    if (result) {
      setRescheduling(false);
      onChanged();
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={task.title}
      subtitle={`Срок: ${formatDue(task.dueAt)} · ${TASK_STATUS_LABEL[task.status]}`}
      width="md"
      hasUnsavedChanges={commentText.trim().length > 0 || returnText.trim().length > 0}
    >
      <div className="ui-stack">
        <dl className="ui-kv">
          <dt>Статус</dt>
          <dd>
            <StatusChip
              status={TASK_STATUS_TONE[task.status]}
              label={TASK_STATUS_LABEL[task.status]}
            />
          </dd>
          <dt>Исполнители</dt>
          <dd>{formatAssignees(task)}</dd>
          <dt>Постановщик</dt>
          <dd>{task.creatorName ?? '—'}</dd>
          <dt>Приоритет</dt>
          <dd>{TASK_PRIORITY_LABEL[task.priority]}</dd>
          <dt>Объект</dt>
          <dd>{formatLinks(task)}</dd>
          {task.label ? (
            <>
              <dt>Метка</dt>
              <dd>{task.label}</dd>
            </>
          ) : null}
          {task.description ? (
            <>
              <dt>Описание</dt>
              <dd>{task.description}</dd>
            </>
          ) : null}
        </dl>

        {canWrite && isOpen ? (
          <div className="ui-inline" role="group" aria-label="Действия с задачей">
            {isAssignee && task.status === 'new' ? (
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={isPending}
                onClick={() => void run('start')}
              >
                Взять в работу
              </button>
            ) : null}
            {isAssignee && task.status === 'in_progress' ? (
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={isPending}
                onClick={() => void run('complete')}
              >
                Выполнить
              </button>
            ) : null}
            {isAuthor && task.status === 'done' ? (
              <>
                <button
                  type="button"
                  className="ui-button ui-button--primary"
                  disabled={isPending}
                  onClick={() => void run('confirm')}
                >
                  Подтвердить выполнение
                </button>
                <button
                  type="button"
                  className="ui-button"
                  disabled={isPending}
                  onClick={() => setReturning(true)}
                >
                  Вернуть
                </button>
              </>
            ) : null}
            {isAuthor ? (
              <>
                <button
                  type="button"
                  className="ui-button"
                  disabled={isPending}
                  onClick={() => setRescheduling(true)}
                >
                  Перенести срок
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--danger"
                  disabled={isPending}
                  onClick={() =>
                    ask(
                      {
                        title: 'Отменить задачу',
                        message: `Задача «${task.title}» будет отменена. Исполнители перестанут её видеть в своих списках; история и комментарии сохранятся.`,
                        confirmLabel: 'Отменить задачу',
                        tone: 'danger'
                      },
                      () => void run('cancel')
                    )
                  }
                >
                  Отменить задачу
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {returning ? (
          <div className="ui-stack" role="group" aria-label="Вернуть на доработку">
            <label className="ui-field">
              <span className="ui-field-label">Что доработать *</span>
              <textarea
                className="ui-textarea"
                value={returnText}
                onChange={(event) => setReturnText(event.target.value)}
                rows={3}
                maxLength={5000}
                required
              />
              <span className="ui-field-hint">
                Без пояснения вернуть задачу нельзя — исполнитель должен понять, что не так.
              </span>
            </label>
            <div className="ui-inline">
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={isPending}
                {...blockedProps(
                  'task-return',
                  returnText.trim() ? undefined : 'Напишите, что доработать'
                )}
                onClick={() => void submitReturn()}
              >
                Вернуть
              </button>
              <button type="button" className="ui-button" onClick={() => setReturning(false)}>
                Не возвращать
              </button>
            </div>
            <BlockedHint
              hintKey="task-return"
              reason={returnText.trim() ? undefined : 'Напишите, что доработать'}
            />
          </div>
        ) : null}

        {rescheduling ? (
          <div className="ui-stack" role="group" aria-label="Перенести срок">
            <label className="ui-field">
              <span className="ui-field-label">Новый срок *</span>
              <input
                className="ui-input"
                type="datetime-local"
                value={newDue}
                onChange={(event) => setNewDue(event.target.value)}
                required
              />
            </label>
            <div className="ui-inline">
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={isPending}
                {...blockedProps('task-due', newDue ? undefined : 'Укажите новый срок')}
                onClick={() => void submitReschedule()}
              >
                Перенести срок
              </button>
              <button type="button" className="ui-button" onClick={() => setRescheduling(false)}>
                Оставить как есть
              </button>
            </div>
            <BlockedHint hintKey="task-due" reason={newDue ? undefined : 'Укажите новый срок'} />
          </div>
        ) : null}

        {mutations.error ? (
          <p className="ui-field-error" role="alert">
            {mutations.error}
          </p>
        ) : null}

        <section className="ui-stack" aria-label="Комментарии">
          <h3 className="ui-section-title">Комментарии</h3>
          {comments.isLoading ? <p className="ui-field-hint">Загружаем…</p> : null}
          {(comments.data?.items ?? []).length === 0 && !comments.isLoading ? (
            <p className="ui-field-hint">
              Комментариев пока нет. Напишите исполнителю или постановщику — переписка останется в
              задаче.
            </p>
          ) : null}
          <ul className="ui-stack">
            {(comments.data?.items ?? []).map((comment) => (
              <li key={comment.id} className="ui-card">
                <div className="ui-muted">
                  {comment.authorName ?? 'Сотрудник'} · {formatDue(comment.createdAt)}
                </div>
                <div>{comment.text}</div>
              </li>
            ))}
          </ul>
          {canWrite ? (
            <div className="ui-stack">
              <label className="ui-field">
                <span className="ui-field-label">Новый комментарий</span>
                <textarea
                  className="ui-textarea"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  rows={2}
                  maxLength={5000}
                />
              </label>
              <button
                type="button"
                className="ui-button"
                disabled={isPending}
                {...blockedProps(
                  'task-comment',
                  commentText.trim() ? undefined : 'Напишите текст комментария'
                )}
                onClick={() => void submitComment()}
              >
                Отправить комментарий
              </button>
              <BlockedHint
                hintKey="task-comment"
                reason={commentText.trim() ? undefined : 'Напишите текст комментария'}
              />
            </div>
          ) : null}
        </section>
      </div>
      {dialog}
    </DetailDrawer>
  );
}
