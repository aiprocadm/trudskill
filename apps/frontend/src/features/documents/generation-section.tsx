'use client';

import { DataTable } from '@trudskill/ui';
import { useState } from 'react';

import { type TaskDto, type TemplateDto, documentsApi } from './api';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/*
 * Перенесён «как есть» из documents-screen.tsx (§8.3, SCR-001). Поведение дословно прежнее,
 * включая то, что вид документа берётся из формы создания шаблона, — это дефект, он чинится
 * следующим коммитом, чтобы правка была видна в разборе отдельно от переноса.
 */
export const GenerationSection = ({
  templates,
  tasks,
  templateId,
  onTemplateIdChange,
  templateType,
  onRefetch,
  actionError,
  onError
}: {
  templates: TemplateDto[];
  tasks: TaskDto[];
  templateId: string;
  onTemplateIdChange: (value: string) => void;
  templateType: string;
  onRefetch: () => Promise<unknown>;
  actionError: string | null;
  onError: (message: string | null) => void;
}) => {
  const { session } = useAuth();
  const [entityType, setEntityType] = useState('course');
  const [entityId, setEntityId] = useState('');
  const [bulkEntityIds, setBulkEntityIds] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDto | null>(null);

  const generateTask = async () => {
    if (!session || !templateId || !entityId.trim()) return;
    try {
      onError(null);
      await documentsApi.generate(session, {
        templateId,
        sourceEntityType: entityType,
        sourceEntityId: entityId.trim(),
        documentType: templateType,
        idempotencyKey: crypto.randomUUID()
      });
      setEntityId('');
      await onRefetch();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось запустить генерацию');
    }
  };

  const bulkGenerate = async () => {
    if (!session || !templateId) return;
    const ids = bulkEntityIds
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!ids.length) return;
    onError(null);
    try {
      await documentsApi.generateBatch(session, {
        templateId,
        sourceEntityType: entityType,
        sourceEntityIds: ids,
        documentType: templateType
      });
      setBulkEntityIds('');
      await onRefetch();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось выполнить пакетную генерацию');
    }
  };

  const retryTask = async (taskId: string) => {
    if (!session) return;
    try {
      onError(null);
      await documentsApi.retryTask(session, taskId);
      await onRefetch();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось повторить задачу');
    }
  };

  const cancelTask = async (taskId: string) => {
    if (!session) return;
    try {
      onError(null);
      await documentsApi.cancelTask(session, taskId);
      await onRefetch();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось отменить задачу');
    }
  };

  return (
    <SectionCard title="Генерация и задачи">
      <div className="ui-inline">
        <select value={templateId} onChange={(event) => onTemplateIdChange(event.target.value)}>
          <option value="">Выберите шаблон</option>
          {templates.map((item) => (
            <option key={item.id ?? item.name} value={item.id ?? item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
          <option value="course">Курс</option>
          <option value="group">Группа</option>
          <option value="learner">Слушатель</option>
          <option value="enrollment">Зачисление</option>
        </select>
        <input
          value={entityId}
          onChange={(event) => setEntityId(event.target.value)}
          placeholder="entity_id"
        />
        <button
          type="button"
          onClick={() => void generateTask()}
          disabled={!templateId || !entityId.trim()}
        >
          Запустить генерацию
        </button>
      </div>
      {tasks.length ? (
        <>
          <DataTable
            columns={[
              { key: 'id', title: 'Task ID' },
              { key: 'status', title: 'Статус' },
              { key: 'source', title: 'Источник' },
              { key: 'requestedAt', title: 'Запрошена' },
              { key: 'finishedAt', title: 'Завершена' }
            ]}
            rows={tasks}
          />
          <div className="ui-stack">
            {tasks.map((task) => (
              <div key={task.id} className="ui-inline">
                <button type="button" onClick={() => setSelectedTask(task)}>
                  Детали {task.id}
                </button>
                <button
                  type="button"
                  onClick={() => void retryTask(task.id)}
                  disabled={task.status !== 'failed'}
                >
                  Повторить
                </button>
                <button
                  type="button"
                  onClick={() => void cancelTask(task.id)}
                  disabled={!['queued', 'running'].includes(task.status)}
                >
                  Отменить
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <SectionEmpty message="Задачи генерации отсутствуют" />
      )}
      <div className="ui-stack">
        <strong>Пакетная генерация документов</strong>
        <p className="ui-text-muted">
          Вставьте идентификаторы (по одному на строку) для массового выпуска документов.
        </p>
        <textarea
          value={bulkEntityIds}
          onChange={(event) => setBulkEntityIds(event.target.value)}
          placeholder="enrollment_1&#10;enrollment_2&#10;enrollment_3"
        />
        <button
          type="button"
          className="ui-button ui-button--primary"
          onClick={() => void bulkGenerate()}
          disabled={!templateId || !bulkEntityIds.trim()}
        >
          Запустить пакетную генерацию
        </button>
      </div>
      {selectedTask ? (
        <div className="ui-code-block">{JSON.stringify(selectedTask, null, 2)}</div>
      ) : null}
      {actionError ? <SectionError message={actionError} /> : null}
    </SectionCard>
  );
};
