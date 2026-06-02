'use client';

import { DataTable, FilterBar, LoadingState } from '@cdoprof/ui';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { govExportApi } from '../../src/features/gov-export/api';
import { useOtRegistryBatches } from '../../src/features/gov-export/hooks';
import { useExportTasks, useSyncLogs } from '../../src/features/integrations/hooks';
import { apiRequest } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

import type { OtRegistryExportOutcome } from '../../src/features/gov-export/types';

export default function GovExportPage() {
  const { session } = useAuth();
  const [providerCode, setProviderCode] = useState('frdo');
  const [exportType, setExportType] = useState('learners');
  const [sourceFilter, setSourceFilter] = useState('{}');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const tasks = useExportTasks(true);
  const logs = useSyncLogs();

  // ОТ-реестр section state
  const [groupId, setGroupId] = useState('');
  const [otFormat, setOtFormat] = useState<'xlsx' | 'xml'>('xlsx');
  const [otBusy, setOtBusy] = useState(false);
  const [otError, setOtError] = useState<string | null>(null);
  const [otOutcome, setOtOutcome] = useState<OtRegistryExportOutcome | null>(null);
  const otBatches = useOtRegistryBatches();

  const onGenerateOt = async () => {
    if (!session) return;
    setOtBusy(true);
    setOtError(null);
    try {
      const outcome = await govExportApi.createOtRegistryExport(session, {
        ...(groupId ? { groupId } : {}),
        format: otFormat
      });
      setOtOutcome(outcome);
      await otBatches.refetch();
    } catch (e) {
      setOtError(e instanceof Error ? e.message : 'Ошибка формирования выгрузки');
    } finally {
      setOtBusy(false);
    }
  };

  const onDownloadOt = async (batchId: string) => {
    if (!session) return;
    const { url } = await govExportApi.getBatchFileUrl(session, batchId);
    window.open(url, '_blank');
  };

  const onUploadResponse = async (batchId: string, file: File) => {
    if (!session) return;
    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
    await govExportApi.importResponse(session, batchId, fileBase64);
    await otBatches.refetch();
  };

  const onCreateTask = async () => {
    if (!session) return;
    setCreating(true);
    setCreateError(null);
    try {
      const parsed = JSON.parse(sourceFilter || '{}') as Record<string, unknown>;
      await apiRequest('/exports/tasks', {
        method: 'POST',
        body: { providerCode, exportType, sourceFilterJsonb: parsed },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      await tasks.refetch();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Ошибка создания задачи');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Выгрузки ФИС ФРДО / ЕИСОТ"
          subtitle="П. 5.22 ТЗ — XML, валидация, история выгрузок"
        />
        <SectionCard title="Мастер формирования пакета">
          <FilterBar>
            <select value={providerCode} onChange={(event) => setProviderCode(event.target.value)}>
              <option value="frdo">frdo</option>
              <option value="eisot">eisot</option>
            </select>
            <select value={exportType} onChange={(event) => setExportType(event.target.value)}>
              <option value="learners">learners</option>
              <option value="courses">courses</option>
              <option value="groups">groups</option>
            </select>
            <input
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              placeholder='{"groupId":"g1"}'
            />
            <button type="button" onClick={() => void onCreateTask()} disabled={creating}>
              {creating ? 'Создание...' : 'Создать задачу выгрузки'}
            </button>
          </FilterBar>
          {createError ? <SectionError message={createError} /> : null}
        </SectionCard>
        <SectionCard title="История задач">
          {tasks.loading ? <LoadingState message="Загрузка задач..." /> : null}
          {tasks.error ? <SectionError message={tasks.error} /> : null}
          {!tasks.loading && !tasks.error && !tasks.data.length ? (
            <SectionEmpty message="Задачи выгрузки отсутствуют" />
          ) : null}
          {tasks.data.length ? (
            <DataTable
              columns={[
                { key: 'id', title: 'Task ID' },
                { key: 'providerCode', title: 'Провайдер' },
                { key: 'exportType', title: 'Тип' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={tasks.data}
            />
          ) : null}
        </SectionCard>
        <SectionCard title="Журнал валидации и синхронизации">
          {logs.loading ? <LoadingState message="Загрузка логов..." /> : null}
          {logs.error ? <SectionError message={logs.error} /> : null}
          {!logs.loading && !logs.error && !logs.data.length ? (
            <SectionEmpty message="Логи отсутствуют" />
          ) : null}
          {logs.data.length ? (
            <DataTable
              columns={[
                { key: 'providerCode', title: 'Провайдер' },
                { key: 'entityType', title: 'Сущность' },
                { key: 'statusCode', title: 'HTTP' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={logs.data}
            />
          ) : null}
        </SectionCard>
        <SectionCard title="Реестр обученных по ОТ (Минтруд)">
          <p
            role="note"
            style={{
              background: '#FEF3C7',
              border: '1px solid #F59E0B',
              borderRadius: 6,
              padding: '8px 12px',
              margin: '0 0 12px'
            }}
          >
            ⚠️ Формат выгрузки предварительный (не сверен с эталоном ЛКОТ). Перед подачей в реестр
            сверьте колонки/XSD-схему 1.0.3 в личном кабинете.
          </p>
          <FilterBar>
            <input
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              placeholder="ID группы (необязательно)"
            />
            <select
              value={otFormat}
              onChange={(event) => setOtFormat(event.target.value as 'xlsx' | 'xml')}
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="xml">XML (XSD 1.0.3)</option>
            </select>
            <button type="button" onClick={() => void onGenerateOt()} disabled={otBusy}>
              {otBusy ? 'Формирование...' : 'Сформировать выгрузку'}
            </button>
          </FilterBar>
          {otError ? <SectionError message={otError} /> : null}
          {otOutcome ? (
            <div>
              <p>
                Экспортировано: {otOutcome.exported} / {otOutcome.total}. Ошибок: {otOutcome.failed}
                .
              </p>
              {otOutcome.errors.length > 0 ? (
                <ul>
                  {otOutcome.errors.map((e) => (
                    <li key={`${e.enrollmentId}-${e.field}`}>
                      {e.fullName || e.enrollmentId}: {e.field} — {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <SectionCard title="История выгрузок">
            {otBatches.loading ? <LoadingState message="Загрузка истории..." /> : null}
            {otBatches.error ? <SectionError message={otBatches.error} /> : null}
            {!otBatches.loading && !otBatches.error && !otBatches.data.length ? (
              <SectionEmpty message="Выгрузки отсутствуют" />
            ) : null}
            {otBatches.data.length ? (
              <DataTable
                columns={[
                  { key: 'id', title: 'ID' },
                  { key: 'batchStatus', title: 'Статус' },
                  { key: 'exportedRows', title: 'Экспортировано' },
                  { key: 'failedRows', title: 'Ошибок' },
                  { key: 'createdAt', title: 'Дата' },
                  {
                    key: 'actionsView',
                    title: 'Действия',
                    render: (row) => row.actionsView
                  }
                ]}
                rows={otBatches.data.map((batch) => ({
                  ...batch,
                  actionsView: (
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => void onDownloadOt(batch.id)}
                        disabled={!batch.fileId}
                      >
                        Скачать
                      </button>
                      <input
                        type="file"
                        accept=".xlsx"
                        onChange={(ev) => {
                          const file = ev.target.files?.[0];
                          if (file) void onUploadResponse(batch.id, file);
                        }}
                      />
                    </span>
                  )
                }))}
              />
            ) : null}
          </SectionCard>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
