'use client';

import { Form, FormActions } from '@trudskill/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useRef, useState } from 'react';

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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; name?: string }>({});
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
    if (code.trim().length < 2) nextFieldErrors.code = 'Код группы: минимум 2 символа.';
    if (name.trim().length < 3) nextFieldErrors.name = 'Название: минимум 3 символа.';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) return;

    setSaving(true);
    try {
      const created = await saveGroup(null, {
        code: code.trim(),
        name: name.trim(),
        status: 'draft'
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
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby={fieldErrors.code ? 'group-code-error' : 'group-code-hint'}
            />
            <p id="group-code-hint" className="ui-field-hint">
              Метка для документов и выгрузок, обычно 2–10 символов: «ОТ-03-26».
            </p>
            <FieldError id="group-code-error" message={fieldErrors.code} />
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
