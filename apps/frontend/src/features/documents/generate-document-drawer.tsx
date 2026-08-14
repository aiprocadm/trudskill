'use client';

import { DetailDrawer, Form, FormActions } from '@trudskill/ui';
import { useState } from 'react';

import { type TemplateDto, documentsApi } from './api';
import { templateTypeLabel } from './document-types';
import { ENTITY_TYPE_LABELS, EntityPicker, type EntityType } from './entity-picker';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

const ENTITY_TYPES: EntityType[] = ['course', 'group', 'learner', 'enrollment'];

/**
 * Выпуск документов по шаблону (TPL-004 в панели).
 *
 * Три правки против прежнего блока «Генерация и задачи»:
 *
 * 1. **Вид документа брался из формы создания шаблона**, а не из самого шаблона: выбрал
 *    в той форме «Протокол» — и выпуск по шаблону удостоверения уходил на сервер с видом
 *    «протокол». Теперь вид берётся у выбранного шаблона и показан человеку.
 * 2. Объект выбирается по названию, а не вставляется идентификатором руками.
 * 3. Выпуск списком — здесь же, вторым способом, вместо отдельного блока с полем, куда
 *    просили вставить идентификаторы построчно.
 */
export const GenerateDocumentDrawer = ({
  template,
  onClose,
  onDone
}: {
  template: TemplateDto | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) => {
  const { session } = useAuth();
  const [entityType, setEntityType] = useState<EntityType>('group');
  const [entityId, setEntityId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [bulkIds, setBulkIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!template) return null;

  const templateId = template.id ?? template.name;
  // Вид документа — свойство шаблона, а не соседней формы.
  const documentType = template.type ?? template.templateType ?? '';

  const submitOne = async () => {
    if (!session || !entityId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await documentsApi.generate(session, {
        templateId,
        sourceEntityType: entityType,
        sourceEntityId: entityId.trim(),
        documentType,
        idempotencyKey: crypto.randomUUID()
      });
      setEntityId('');
      await onDone();
      onClose();
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : 'Не удалось запустить выпуск'
      );
    } finally {
      setBusy(false);
    }
  };

  const submitBulk = async () => {
    if (!session) return;
    const ids = bulkIds
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    try {
      await documentsApi.generateBatch(session, {
        templateId,
        sourceEntityType: entityType,
        sourceEntityIds: ids,
        documentType
      });
      setBulkIds('');
      await onDone();
      onClose();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Не удалось запустить выпуск');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailDrawer
      open={true}
      title={`Выпуск: ${template.name}`}
      width="md"
      hasUnsavedChanges={Boolean(entityId || bulkIds.trim())}
      onClose={onClose}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void submitOne();
        }}
        noValidate
      >
        <p className="ui-hint">
          Будет выпущен документ вида «{templateTypeLabel(documentType)}» по этому бланку.
        </p>
        <label className="ui-field">
          <span className="ui-field-label">Для кого выпускаем</span>
          <select
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value as EntityType);
              setEntityId('');
            }}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ENTITY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <EntityPicker
          entityType={entityType}
          value={entityId}
          onChange={setEntityId}
          groupId={groupId}
          onGroupIdChange={setGroupId}
        />
        {error ? <SectionError message={error} /> : null}
        <FormActions>
          <button type="button" className="ui-button-link" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="ui-button--primary" disabled={!entityId || busy}>
            {busy ? 'Запускаем…' : 'Выпустить документ'}
          </button>
        </FormActions>
      </Form>

      <details className="ui-stack">
        <summary>Выпустить сразу нескольким</summary>
        <p className="ui-hint">
          По одному идентификатору в строке. Каждая строка станет отдельной задачей выпуска — сбой
          одной не отменяет остальные.
        </p>
        <textarea
          value={bulkIds}
          onChange={(event) => setBulkIds(event.target.value)}
          aria-label="Идентификаторы для выпуска списком"
        />
        <button
          type="button"
          className="ui-button-secondary"
          onClick={() => void submitBulk()}
          disabled={!bulkIds.trim() || busy}
        >
          Выпустить списком
        </button>
      </details>
    </DetailDrawer>
  );
};
