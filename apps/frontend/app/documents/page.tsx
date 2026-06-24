'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

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
  templateType?: string;
  type?: string;
  status: string;
  currentVersion?: string;
  currentVersionId?: string;
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
  const [bulkEntityIds, setBulkEntityIds] = useState('');
  const [fileIdForVersion, setFileIdForVersion] = useState('');
  const [varCode, setVarCode] = useState('');
  const [varDisplayName, setVarDisplayName] = useState('');
  const [varCategory, setVarCategory] = useState('learner');
  const [varDataType, setVarDataType] = useState('string');
  const [bindType, setBindType] = useState<'course' | 'group' | 'direction'>('group');
  const [bindGroupId, setBindGroupId] = useState('');
  const [bindCourseId, setBindCourseId] = useState('');
  const [bindDirectionId, setBindDirectionId] = useState('');
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
      const items = (templatesResp.items as TemplateDto[]).map((item) => ({
        ...item,
        type: item.templateType ?? item.type ?? ''
      }));
      return { templates: items, tasks: tasksResp.items };
    }
  });

  const versionsQuery = useQuery({
    queryKey: ['template-versions', session?.user.id, generateTemplateId],
    enabled: Boolean(session && generateTemplateId),
    queryFn: async () => {
      const qs = new URLSearchParams({ templateId: generateTemplateId });
      return apiRequest<{
        items: { id: string; versionNo: number; fileId: string; isActive: boolean }[];
      }>(`/template-versions?${qs.toString()}`, {
        auth: {
          accessToken: session!.tokens.accessToken,
          tenantId: session!.user.tenantId,
          userId: session!.user.id
        }
      });
    }
  });

  const activeTemplateVersionId = useMemo(() => {
    const items = versionsQuery.data?.items ?? [];
    const active = items.find((x) => x.isActive);
    return active?.id ?? items[items.length - 1]?.id;
  }, [versionsQuery.data?.items]);

  const variablesQuery = useQuery({
    queryKey: ['template-variables', session?.user.id, generateTemplateId, activeTemplateVersionId],
    enabled: Boolean(session && activeTemplateVersionId),
    queryFn: async () => {
      const vId = activeTemplateVersionId!;
      const qs = new URLSearchParams({ templateVersionId: vId });
      return apiRequest<{
        items: { id: string; variableCode: string; displayName: string; categoryCode: string }[];
      }>(`/template-variables?${qs.toString()}`, {
        auth: {
          accessToken: session!.tokens.accessToken,
          tenantId: session!.user.tenantId,
          userId: session!.user.id
        }
      });
    }
  });

  const bindingsQuery = useQuery({
    queryKey: ['template-bindings', session?.user.id, generateTemplateId],
    enabled: Boolean(session && generateTemplateId),
    queryFn: async () => {
      const qs = new URLSearchParams({ templateId: generateTemplateId });
      return apiRequest<{
        items: { id: string; bindType: string; groupId?: string; courseId?: string }[];
      }>(`/template-bindings?${qs.toString()}`, {
        auth: {
          accessToken: session!.tokens.accessToken,
          tenantId: session!.user.tenantId,
          userId: session!.user.id
        }
      });
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
          sourceEntityType: entityType,
          sourceEntityId: entityId.trim(),
          documentType: templateType,
          idempotencyKey: crypto.randomUUID()
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

  const bulkGenerate = async () => {
    if (!session || !generateTemplateId) return;
    const ids = bulkEntityIds
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!ids.length) return;
    setActionError(null);
    try {
      await apiRequest('/documents/generate/batch', {
        method: 'POST',
        body: {
          templateId: generateTemplateId,
          sourceEntityType: entityType,
          sourceEntityIds: ids,
          documentType: templateType
        },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setBulkEntityIds('');
      await data.refetch();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Не удалось выполнить пакетную генерацию'
      );
    }
  };

  const createVersionAndActivate = async () => {
    if (!session || !generateTemplateId || !fileIdForVersion.trim()) return;
    try {
      setActionError(null);
      const created = await apiRequest<{ id: string }>('/template-versions', {
        method: 'POST',
        body: {
          templateId: generateTemplateId,
          fileId: fileIdForVersion.trim()
        },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      await apiRequest(`/template-versions/${created.id}/activate`, {
        method: 'POST',
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setFileIdForVersion('');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['template-versions'] });
      await queryClient.invalidateQueries({ queryKey: ['template-variables'] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось создать версию');
    }
  };

  const addVariable = async () => {
    if (!session || !activeTemplateVersionId || !varCode.trim() || !varDisplayName.trim()) return;
    try {
      setActionError(null);
      await apiRequest('/template-variables', {
        method: 'POST',
        body: {
          templateVersionId: activeTemplateVersionId,
          variableCode: varCode.trim(),
          displayName: varDisplayName.trim(),
          categoryCode: varCategory,
          dataType: varDataType,
          isRequired: false
        },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setVarCode('');
      setVarDisplayName('');
      await queryClient.invalidateQueries({ queryKey: ['template-variables'] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось добавить переменную');
    }
  };

  const addBinding = async () => {
    if (!session || !generateTemplateId) return;
    if (bindType === 'group' && !bindGroupId.trim()) return;
    if (bindType === 'course' && !bindCourseId.trim()) return;
    if (bindType === 'direction' && !bindDirectionId.trim()) return;
    try {
      setActionError(null);
      await apiRequest('/template-bindings', {
        method: 'POST',
        body: {
          templateId: generateTemplateId,
          bindType,
          groupId: bindType === 'group' ? bindGroupId.trim() : undefined,
          courseId: bindType === 'course' ? bindCourseId.trim() : undefined,
          directionId: bindType === 'direction' ? bindDirectionId.trim() : undefined
        },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setBindGroupId('');
      setBindCourseId('');
      setBindDirectionId('');
      await queryClient.invalidateQueries({ queryKey: ['template-bindings'] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось создать привязку');
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
          subtitle="Шаблоны, генерация, batch-выпуск и контроль статусов по задачам"
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
                {/* Pillar A Plan B §5.4: 7 регулируемых типов + contract grandfathered. */}
                <option value="certificate">Удостоверение</option>
                <option value="protocol">Протокол</option>
                <option value="order">Приказ</option>
                <option value="diploma">Диплом</option>
                <option value="attestation">Свидетельство об аттестации</option>
                <option value="reference">Справка</option>
                <option value="report">Отчёт</option>
                <option value="contract">Договор</option>
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
        <SectionCard title="Версия шаблона, переменные и привязки">
          <p className="ui-text-muted">
            Выберите шаблон в списке ниже (поле «Выберите шаблон» в блоке генерации). Укажите{' '}
            <code>fileId</code> из хранилища файлов и создайте версию, затем добавьте переменные и
            привязку к курсу или группе для автоматической выдачи сертификата.
          </p>
          {!generateTemplateId ? (
            <SectionEmpty message="Сначала выберите шаблон в блоке генерации" />
          ) : null}
          {generateTemplateId ? (
            <div className="ui-stack">
              <strong>Версии</strong>
              {versionsQuery.isLoading ? <LoadingState message="Загрузка версий…" /> : null}
              {versionsQuery.data?.items?.length ? (
                <DataTable
                  columns={[
                    { key: 'versionNo', title: '№' },
                    { key: 'fileId', title: 'fileId' },
                    { key: 'isActive', title: 'Активна' }
                  ]}
                  rows={versionsQuery.data.items}
                />
              ) : (
                <SectionEmpty message="Версий пока нет" />
              )}
              <div className="ui-inline">
                <input
                  value={fileIdForVersion}
                  onChange={(event) => setFileIdForVersion(event.target.value)}
                  placeholder="fileId (из backend файлов)"
                />
                <button
                  type="button"
                  onClick={() => void createVersionAndActivate()}
                  disabled={!fileIdForVersion.trim()}
                >
                  Создать и активировать версию
                </button>
              </div>
              <strong>Переменные (первая активная версия)</strong>
              {variablesQuery.isLoading ? <LoadingState message="Загрузка переменных…" /> : null}
              {variablesQuery.data?.items?.length ? (
                <DataTable
                  columns={[
                    { key: 'variableCode', title: 'Код' },
                    { key: 'displayName', title: 'Подпись' },
                    { key: 'categoryCode', title: 'Категория' }
                  ]}
                  rows={variablesQuery.data.items}
                />
              ) : (
                <SectionEmpty message="Переменных нет — добавьте ниже" />
              )}
              <div className="ui-inline">
                <input
                  value={varCode}
                  onChange={(e) => setVarCode(e.target.value)}
                  placeholder="variable_code"
                />
                <input
                  value={varDisplayName}
                  onChange={(e) => setVarDisplayName(e.target.value)}
                  placeholder="Подпись"
                />
                <select value={varCategory} onChange={(e) => setVarCategory(e.target.value)}>
                  {/* Pillar A Plan B §5.5: все 10 категорий, фиксированных CHECK migration 0032. */}
                  <option value="tenant">Организация (tenant)</option>
                  <option value="group">Группа (group)</option>
                  <option value="learner">Ученик (learner)</option>
                  <option value="counterparty">Контрагент (counterparty)</option>
                  <option value="course">Курс (course)</option>
                  <option value="commission">Комиссия (commission)</option>
                  <option value="document">Документ (document)</option>
                  <option value="program">Программа (program)</option>
                  <option value="enrollment">Зачисление (enrollment)</option>
                  <option value="group_learners">Ученики группы (group_learners)</option>
                </select>
                <input
                  value={varDataType}
                  onChange={(e) => setVarDataType(e.target.value)}
                  placeholder="string"
                />
                <button
                  type="button"
                  onClick={() => void addVariable()}
                  disabled={!varCode.trim() || !varDisplayName.trim()}
                >
                  Добавить переменную
                </button>
              </div>
              <strong>Привязки шаблона</strong>
              {bindingsQuery.data?.items?.length ? (
                <DataTable
                  columns={[
                    { key: 'bindType', title: 'Тип' },
                    { key: 'groupId', title: 'groupId' },
                    { key: 'courseId', title: 'courseId' }
                  ]}
                  rows={bindingsQuery.data.items}
                />
              ) : (
                <SectionEmpty message="Привязок нет" />
              )}
              <div className="ui-inline">
                <select
                  value={bindType}
                  onChange={(e) => setBindType(e.target.value as typeof bindType)}
                >
                  <option value="group">Группа</option>
                  <option value="course">Курс</option>
                  <option value="direction">Направление</option>
                </select>
                <input
                  value={bindGroupId}
                  onChange={(e) => setBindGroupId(e.target.value)}
                  placeholder="groupId"
                  disabled={bindType !== 'group'}
                />
                <input
                  value={bindCourseId}
                  onChange={(e) => setBindCourseId(e.target.value)}
                  placeholder="courseId"
                  disabled={bindType !== 'course'}
                />
                <input
                  value={bindDirectionId}
                  onChange={(e) => setBindDirectionId(e.target.value)}
                  placeholder="directionId"
                  disabled={bindType !== 'direction'}
                />
                <button type="button" onClick={() => void addBinding()}>
                  Добавить привязку
                </button>
              </div>
            </div>
          ) : null}
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
              disabled={!generateTemplateId || !bulkEntityIds.trim()}
            >
              Запустить пакетную генерацию
            </button>
          </div>
          {selectedTask ? (
            <div className="ui-code-block">{JSON.stringify(selectedTask, null, 2)}</div>
          ) : null}
          {actionError ? <SectionError message={actionError} /> : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
