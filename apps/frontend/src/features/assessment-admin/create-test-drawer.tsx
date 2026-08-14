'use client';

import { DetailDrawer, Form, FormActions } from '@trudskill/ui';
import { useState } from 'react';

import { useCreateTest } from './hooks';
import { CourseSelect } from '../courses/course-picker';

/**
 * Создание теста панелью (TPL-001: у реестра одно первичное действие в шапке).
 *
 * Форма стояла отдельным блоком над списком и просила «ID курса» текстом. Теперь курс
 * выбирается по названию, а форма не занимает место, пока не нужна.
 */
export const CreateTestDrawer = ({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const createTest = useCreateTest();

  if (!open) return null;

  const submit = async () => {
    if (!title.trim() || !courseId) return;
    const result = await createTest.mutate({ courseId, title: title.trim() });
    if (result) {
      setTitle('');
      setCourseId('');
      onCreated();
      onClose();
    }
  };

  return (
    <DetailDrawer
      open={true}
      title="Новый тест"
      width="sm"
      hasUnsavedChanges={title.trim().length > 0}
      onClose={onClose}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        <label htmlFor="test-title" className="ui-field">
          <span className="ui-field-label">Название теста</span>
          <input
            id="test-title"
            className="ui-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <p className="ui-field-hint">Слушатель увидит это название перед началом теста.</p>
        </label>
        <CourseSelect
          value={courseId}
          onChange={setCourseId}
          required
          hint="Тест сдают слушатели этого курса."
        />
        {createTest.error ? <p className="ui-field-error">{createTest.error}</p> : null}
        <FormActions>
          <button type="button" className="ui-button-link" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="ui-button--primary"
            disabled={createTest.isPending || !title.trim() || !courseId}
          >
            {createTest.isPending ? 'Создаём…' : 'Создать тест'}
          </button>
        </FormActions>
      </Form>
    </DetailDrawer>
  );
};
