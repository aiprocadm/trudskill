'use client';

import { DetailDrawer, Form, FormActions } from '@trudskill/ui';
import { useState } from 'react';

import { documentsApi } from './api';
import { ALL_TEMPLATE_TYPES, TEMPLATE_TYPE_LABELS } from './document-types';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * Создание шаблона (TPL-004 в панели).
 *
 * Раньше форма стояла под таблицей реестра, а вид документа, выбранный в ней, ПОПУТНО
 * определял вид выпускаемых документов в другом блоке страницы. Теперь это отдельное
 * действие с понятным результатом и без побочных связей.
 */
export const CreateTemplateDrawer = ({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<unknown>;
}) => {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState<string>('certificate');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!session || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await documentsApi.createTemplate(session, { name: name.trim(), templateType });
      setName('');
      await onCreated();
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не удалось создать шаблон');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <DetailDrawer
      open={true}
      title="Новый шаблон документа"
      width="sm"
      hasUnsavedChanges={name.trim().length > 0}
      onClose={onClose}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        <label htmlFor="template-name" className="ui-field">
          <span className="ui-field-label">Название шаблона</span>
          <input
            id="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <p className="ui-field-hint">
            Так шаблон будет виден в реестре — например, «Удостоверение ОТ, 2026».
          </p>
        </label>
        <label htmlFor="template-type" className="ui-field">
          <span className="ui-field-label">Вид документа</span>
          <select
            id="template-type"
            value={templateType}
            onChange={(event) => setTemplateType(event.target.value)}
          >
            {ALL_TEMPLATE_TYPES.map((type) => (
              <option key={type} value={type}>
                {TEMPLATE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <p className="ui-field-hint">
            Определяет, что именно выпускается по этому бланку и как документ попадёт в книгу
            выдачи.
          </p>
        </label>
        {error ? <SectionError message={error} /> : null}
        <FormActions>
          <button type="button" className="ui-button-link" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="ui-button--primary" disabled={!name.trim() || saving}>
            {saving ? 'Создаём…' : 'Создать шаблон'}
          </button>
        </FormActions>
      </Form>
    </DetailDrawer>
  );
};
