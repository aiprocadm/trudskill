'use client';

import { Form, FormActions } from '@trudskill/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useRef, useState } from 'react';

import { STUDY_FORM_LABEL } from './group-status';
import { FieldError, FormErrorSummary, useFocusFirstError } from '../../components/form-feedback';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
import { useDomainMutations } from '../mvp/hooks';
import { readApiMessage } from '../mvp/screen-helpers';

/*
 * Перенесён из features/mvp/screens.tsx (§8.3, порядок 2), редизайн под TPL-004.
 *
 * Экран назывался «Мастер создания группы», хотя мастера в нём нет — это короткая форма
 * из двух полей. Название шага, подписи «Код» и «Название» без пояснений и кнопка
 * «Создать» не отвечали на вопрос, что именно получится.
 */
export const GroupCreateScreen = () => {
  const router = useRouter();
  const { saveGroup } = useDomainMutations();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  /* МГ-B1.1 (срез 8.3): даты, форма обучения и комментарий — как в мастере CDOPROF §6.2. */
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [examDate, setExamDate] = useState('');
  const [studyForm, setStudyForm] = useState('');
  const [comment, setComment] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    endDate?: string;
    examDate?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const formErrors = useMemo(
    () =>
      Object.entries(fieldErrors).map(([field, message]) => ({
        field,
        message: message ?? ''
      })),
    [fieldErrors]
  );

  useFocusFirstError(formErrors, {
    code: codeRef.current,
    name: nameRef.current
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextFieldErrors: typeof fieldErrors = {};
    /* Код необязателен: пустой — сервер подставит по шаблону центра (МГ-B1.2). */
    if (code.trim() && code.trim().length < 2)
      nextFieldErrors.code = 'Код группы: минимум 2 символа.';
    if (name.trim().length < 3) nextFieldErrors.name = 'Название: минимум 3 символа.';
    if (startDate && endDate && endDate < startDate) {
      nextFieldErrors.endDate = 'Дата окончания не может быть раньше даты начала.';
    }
    if (startDate && examDate && examDate < startDate) {
      nextFieldErrors.examDate = 'Дата экзамена не может быть раньше даты начала.';
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) return;

    setSaving(true);
    try {
      const created = await saveGroup(null, {
        ...(code.trim() ? { code: code.trim() } : {}),
        name: name.trim(),
        status: 'draft',
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(examDate ? { examDate } : {}),
        ...(studyForm ? { studyForm } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {})
      });
      router.push(`/groups/${created.id}`);
    } catch (createError) {
      setSaveError(readApiMessage(createError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Новая группа"
        subtitle="Группа объединяет слушателей одного курса и общий срок обучения"
      />
      <SectionCard title="Как назовём группу">
        <Form onSubmit={(event) => void onSubmit(event)} noValidate>
          <FormErrorSummary id="group-create-summary" errors={formErrors} />
          <label htmlFor="group-name" className="ui-field">
            <span className="ui-field-label">Название группы</span>
            <input
              id="group-name"
              ref={nameRef}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'group-name-error' : 'group-name-hint'}
            />
            <p id="group-name-hint" className="ui-field-hint">
              Так группу будут искать в реестре — например, «Охрана труда, март 2026».
            </p>
            <FieldError id="group-name-error" message={fieldErrors.name} />
          </label>
          <label htmlFor="group-code" className="ui-field">
            <span className="ui-field-label">Короткий код</span>
            <input
              id="group-code"
              ref={codeRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby={fieldErrors.code ? 'group-code-error' : 'group-code-hint'}
            />
            <p id="group-code-hint" className="ui-field-hint">
              Оставьте пустым — код подставится по шаблону центра (год, неделя, номер). Свой код:
              2–10 символов, например «ОТ-03-26».
            </p>
            <FieldError id="group-code-error" message={fieldErrors.code} />
          </label>
          <label htmlFor="group-start" className="ui-field">
            <span className="ui-field-label">Начало обучения</span>
            <input
              id="group-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label htmlFor="group-end" className="ui-field">
            <span className="ui-field-label">Окончание обучения</span>
            <input
              id="group-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={Boolean(fieldErrors.endDate)}
              aria-describedby={fieldErrors.endDate ? 'group-end-error' : 'group-end-hint'}
            />
            <p id="group-end-hint" className="ui-field-hint">
              Пусто — начало плюс срок обучения из настроек центра.
            </p>
            <FieldError id="group-end-error" message={fieldErrors.endDate} />
          </label>
          <label htmlFor="group-exam" className="ui-field">
            <span className="ui-field-label">Дата экзамена</span>
            <input
              id="group-exam"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              aria-invalid={Boolean(fieldErrors.examDate)}
              aria-describedby={fieldErrors.examDate ? 'group-exam-error' : 'group-exam-hint'}
            />
            <p id="group-exam-hint" className="ui-field-hint">
              Пусто — совпадает с окончанием обучения.
            </p>
            <FieldError id="group-exam-error" message={fieldErrors.examDate} />
          </label>
          <label htmlFor="group-study-form" className="ui-field">
            <span className="ui-field-label">Форма обучения</span>
            <select
              id="group-study-form"
              className="ui-select"
              value={studyForm}
              onChange={(event) => setStudyForm(event.target.value)}
            >
              <option value="">По умолчанию центра</option>
              {Object.entries(STUDY_FORM_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="group-comment" className="ui-field">
            <span className="ui-field-label">Комментарий</span>
            <textarea
              id="group-comment"
              rows={2}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          {saveError ? <SectionError message={saveError} /> : null}
          <FormActions>
            <Link className="ui-button-link" href="/groups">
              Отмена
            </Link>
            {/* Кнопка называет результат и так же называется в реестре и в подтверждении (TXT-002). */}
            <button type="submit" className="ui-button--primary" disabled={saving}>
              {saving ? 'Создаём…' : 'Создать группу'}
            </button>
          </FormActions>
        </Form>
      </SectionCard>
    </PageContainer>
  );
};
