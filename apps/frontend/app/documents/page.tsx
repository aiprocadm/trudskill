'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { useTaskRealtime } from '../../src/features/communication/hooks';
import { apiRequest } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

interface TemplateDto {
  id?: string;
  name: string;
  type: string;
  status: string;
  currentVersion: string;
  updatedAt: string;
}
interface TaskDto {
  id: string;
  status: string;
  source: string;
  errorMessage?: string;
  requestedAt?: string;
  finishedAt?: string;
}

export default function DocumentsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [templateName, setTemplateName] = useState('');
  const [templateType, setTemplateType] = useState('certificate');
  const [generateTemplateId, setGenerateTemplateId] = useState('');
  const [entityType, setEntityType] = useState('course');
  const [entityId, setEntityId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDto | null>(null);
  const data = useQuery({
    queryKey: ['documents', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const auth = {
        auth: {
          accessToken: session!.tokens.accessToken,
          tenantId: session!.user.tenantId,
          userId: session!.user.id
        }
      };
      const [templatesResp, tasksResp] = await Promise.all([
        apiRequest<{ items: TemplateDto[] }>('/templates', auth),
        apiRequest<{ items: TaskDto[] }>('/document-tasks', auth)
      ]);
      return { templates: templatesResp.items, tasks: tasksResp.items };
    }
  });

  useTaskRealtime(
    data.data?.tasks[0]?.id,
    () => void queryClient.invalidateQueries({ queryKey: ['documents'] })
  );

  const createTemplate = async () => {
    if (!session || !templateName.trim()) return;
    try {
      setActionError(null);
      await apiRequest('/templates', {
        method: 'POST',
        body: { name: templateName.trim(), templateType },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setTemplateName('');
      await data.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось создать шаблон');
    }
  };

  const generateTask = async () => {
    if (!session || !generateTemplateId || !entityId.trim()) return;
    try {
      setActionError(null);
      await apiRequest('/documents/generate', {
        method: 'POST',
        body: {
          templateId: generateTemplateId,
          entityType,
          entityId: entityId.trim(),
          payload: {}
        },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setEntityId('');
      await data.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось запустить генерацию');
    }
  };

  const retryTask = async (taskId: string) => {
    if (!session) return;
    try {
      setActionError(null);
      await apiRequest(`/document-tasks/${taskId}/retry`, {
        method: 'POST',
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      await data.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось повторить задачу');
    }
  };

  const cancelTask = async (taskId: string) => {
    if (!session) return;
    try {
      setActionError(null);
      await apiRequest(`/document-tasks/${taskId}/cancel`, {
        method: 'POST',
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      await data.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось отменить задачу');
    }
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Документы"
          actions={<button onClick={() => void data.refetch()}>Обновить</button>}
        />
        <SectionCard title="Реестр шаблонов">
          {data.error ? (
            <SectionError
              message={
                data.error instanceof Error ? data.error.message : 'Не удалось загрузить документы'
              }
            />
          ) : null}
          {data.isLoading ? <LoadingState message="Загрузка шаблонов…" /> : null}
          {!data.isLoading && data.data?.templates.length ? (
            <>
              <DataTable
                columns={[
                  { key: 'name', title: 'Шаблон' },
                  { key: 'type', title: 'Тип' },
                  { key: 'currentVersion', title: 'Версия' },
                  { key: 'updatedAt', title: 'Обновлен' }
                ]}
                rows={data.data.templates}
              />
              <div className="ui-inline">
                {data.data.templates.map((item) => (
                  <StatusChip key={item.name} status={item.status} />
                ))}
              </div>
            </>
          ) : null}
          {!data.isLoading && !data.data?.templates.length && !data.error ? (
            <SectionEmpty message="Шаблоны не найдены" />
          ) : null}
          <div className="ui-stack" style={{ marginTop: 12 }}>
            <strong>Создать шаблон</strong>
            <div className="ui-inline">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Название шаблона"
              />
              <select
                value={templateType}
                onChange={(event) => setTemplateType(event.target.value)}
              >
                <option value="certificate">certificate</option>
                <option value="protocol">protocol</option>
                <option value="order">order</option>
              </select>
              <button
                type="button"
                onClick={() => void createTemplate()}
                disabled={!templateName.trim()}
              >
                Создать шаблон
              </button>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Генерация и задачи">
          <div className="ui-inline">
            <select
              value={generateTemplateId}
              onChange={(event) => setGenerateTemplateId(event.target.value)}
            >
              <option value="">Выберите шаблон</option>
              {data.data?.templates.map((item) => (
                <option key={item.id ?? item.name} value={item.id ?? item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="course">course</option>
              <option value="group">group</option>
              <option value="learner">learner</option>
            </select>
            <input
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              placeholder="entity_id"
            />
            <button
              type="button"
              onClick={() => void generateTask()}
              disabled={!generateTemplateId || !entityId.trim()}
            >
              Запустить генерацию
            </button>
          </div>
          {data.data?.tasks.length ? (
            <>
              <DataTable
                columns={[
                  { key: 'id', title: 'Task ID' },
                  { key: 'status', title: 'Статус' },
                  { key: 'source', title: 'Источник' },
                  { key: 'requestedAt', title: 'Запрошена' },
                  { key: 'finishedAt', title: 'Завершена' }
                ]}
                rows={data.data.tasks}
              />
              <div className="ui-stack">
                {data.data.tasks.map((task) => (
                  <div key={task.id} className="ui-inline">
                    <button type="button" onClick={() => setSelectedTask(task)}>
                      Детали {task.id}
                    </button>
                    <button
                      type="button"
                      onClick={() => void retryTask(task.id)}
                      disabled={task.status !== 'failed'}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => void cancelTask(task.id)}
                      disabled={!['queued', 'running'].includes(task.status)}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <SectionEmpty message="Задачи генерации отсутствуют" />
          )}
          {selectedTask ? (
            <div className="ui-code-block">{JSON.stringify(selectedTask, null, 2)}</div>
          ) : null}
          {actionError ? <SectionError message={actionError} /> : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
