'use client';

import { DetailDrawer } from '@trudskill/ui';
import { useState } from 'react';

import { useCreateQuestionBank, useUpdateQuestionBank } from './hooks';
import { CourseSelect } from '../courses/course-picker';

import type { QuestionBankListItem } from './types';

interface Props {
  bank?: QuestionBankListItem | null;
  onClose: () => void;
  onSaved?: (bank: QuestionBankListItem) => void;
}

export function QuestionBankEditDrawer({ bank, onClose, onSaved }: Props) {
  const isEditing = Boolean(bank);
  const [title, setTitle] = useState(bank?.title ?? '');
  const [description, setDescription] = useState(bank?.description ?? '');
  const [courseId, setCourseId] = useState(bank?.courseId ?? '');
  const [code, setCode] = useState(bank?.code ?? '');

  const create = useCreateQuestionBank();
  const update = useUpdateQuestionBank();
  const isPending = create.isPending || update.isPending;
  const error = create.error || update.error;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(courseId.trim() ? { courseId: courseId.trim() } : {}),
      ...(code.trim() ? { code: code.trim() } : {})
    };
    const result =
      isEditing && bank ? await update.mutate(bank.id, payload) : await create.mutate(payload);
    if (result) onSaved?.(result);
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={isEditing ? 'Редактирование банка' : 'Создание банка'}
    >
      <form className="ui-form" onSubmit={submit}>
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

        {/* Курс выбирается по названию: идентификатор администратору неоткуда взять. */}
        <CourseSelect
          value={courseId}
          onChange={setCourseId}
          label="Курс (по желанию)"
          hint="Банк можно не привязывать к курсу — тогда его вопросы доступны любому тесту."
        />

        <label className="ui-field">
          <span>Код (опционально)</span>
          <input
            type="text"
            className="ui-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
          />
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
            Сохранить банк вопросов
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}
