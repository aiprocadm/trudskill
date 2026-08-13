'use client';

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
 * Перенесён «как есть» из features/mvp/screens.tsx (§8.3, порядок 2; правило SCR-001).
 * Редизайн под TPL-004 (FormLayout, мастер ≤3 шагов) — следующий срез.
 */
export const GroupCreateScreen = () => {
  const router = useRouter();
  const { saveGroup } = useDomainMutations();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; name?: string }>({});
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

    try {
      const created = await saveGroup(null, {
        code: code.trim(),
        name: name.trim(),
        status: 'draft'
      });
      router.push(`/groups/${created.id}`);
    } catch (createError) {
      setSaveError(readApiMessage(createError));
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Мастер создания группы" />
      <SectionCard title="Основные атрибуты">
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="ui-form"
          style={{ maxWidth: 480 }}
          noValidate
        >
          <FormErrorSummary id="group-create-summary" errors={formErrors} />
          <label htmlFor="group-code" className="ui-field">
            <span className="ui-field-label">Код</span>
            <input
              id="group-code"
              ref={codeRef}
              required
              placeholder="Код"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby={fieldErrors.code ? 'group-code-error' : undefined}
            />
            <FieldError id="group-code-error" message={fieldErrors.code} />
          </label>
          <label htmlFor="group-name" className="ui-field">
            <span className="ui-field-label">Название</span>
            <input
              id="group-name"
              ref={nameRef}
              required
              placeholder="Название"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'group-name-error' : undefined}
            />
            <FieldError id="group-name-error" message={fieldErrors.name} />
          </label>
          <button type="submit">Создать</button>
          {saveError ? <SectionError message={saveError} /> : null}
        </form>
      </SectionCard>
    </PageContainer>
  );
};
