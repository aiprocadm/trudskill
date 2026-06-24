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
import { exportSignatureBadgeLabel } from '../../src/features/gov-export/export-signature-badge';
import {
  useEisotTestingBatches,
  useFrdoRegistryBatches,
  useNmoBatches,
  useOtRegistryBatches,
  useRostechnadzorBatches
} from '../../src/features/gov-export/hooks';
import { useExportTasks, useSyncLogs } from '../../src/features/integrations/hooks';
import { apiRequest } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

import type {
  EisotTestingExportOutcome,
  FrdoRegistryExportOutcome,
  NmoExportOutcome,
  OtRegistryExportOutcome,
  RostechnadzorExportOutcome
} from '../../src/features/gov-export/types';

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

  // ФИС ФРДО (Рособрнадзор) section state
  const [frdoFrom, setFrdoFrom] = useState('');
  const [frdoTo, setFrdoTo] = useState('');
  const [frdoBusy, setFrdoBusy] = useState(false);
  const [frdoError, setFrdoError] = useState<string | null>(null);
  const [frdoOutcome, setFrdoOutcome] = useState<FrdoRegistryExportOutcome | null>(null);
  const frdoBatches = useFrdoRegistryBatches();

  // ЕИСОТ «лица на тестирование» section state
  const [eisotFrom, setEisotFrom] = useState('');
  const [eisotTo, setEisotTo] = useState('');
  const [eisotBusy, setEisotBusy] = useState(false);
  const [eisotError, setEisotError] = useState<string | null>(null);
  const [eisotOutcome, setEisotOutcome] = useState<EisotTestingExportOutcome | null>(null);
  const eisotBatches = useEisotTestingBatches();

  // Ростехнадзор (промышленная безопасность) section state — Phase 6
  const [rostechGroupId, setRostechGroupId] = useState('');
  const [rostechClientId, setRostechClientId] = useState('');
  const [rostechFrom, setRostechFrom] = useState('');
  const [rostechTo, setRostechTo] = useState('');
  const [rostechBusy, setRostechBusy] = useState(false);
  const [rostechError, setRostechError] = useState<string | null>(null);
  const [rostechOutcome, setRostechOutcome] = useState<RostechnadzorExportOutcome | null>(null);
  const rostechBatches = useRostechnadzorBatches();

  // Минздрав-НМО (непрерывное медобразование, ЗЕТ) section state — Phase 6
  const [nmoFrom, setNmoFrom] = useState('');
  const [nmoTo, setNmoTo] = useState('');
  const [nmoGroupId, setNmoGroupId] = useState('');
  const [nmoBusy, setNmoBusy] = useState(false);
  const [nmoError, setNmoError] = useState<string | null>(null);
  const [nmoOutcome, setNmoOutcome] = useState<NmoExportOutcome | null>(null);
  const nmoBatches = useNmoBatches();

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

  const onGenerateFrdo = async () => {
    if (!session) return;
    setFrdoBusy(true);
    setFrdoError(null);
    try {
      const outcome = await govExportApi.createFrdoRegistryExport(session, {
        ...(frdoFrom ? { from: frdoFrom } : {}),
        ...(frdoTo ? { to: frdoTo } : {})
      });
      setFrdoOutcome(outcome);
      await frdoBatches.refetch();
    } catch (e) {
      setFrdoError(e instanceof Error ? e.message : 'Ошибка формирования выгрузки ФРДО');
    } finally {
      setFrdoBusy(false);
    }
  };

  const onDownloadFrdo = async (batchId: string) => {
    if (!session) return;
    const { url } = await govExportApi.getFrdoBatchFileUrl(session, batchId);
    window.open(url, '_blank');
  };

  const onGenerateEisot = async () => {
    if (!session) return;
    setEisotBusy(true);
    setEisotError(null);
    try {
      const outcome = await govExportApi.createEisotTestingExport(session, {
        ...(eisotFrom ? { from: eisotFrom } : {}),
        ...(eisotTo ? { to: eisotTo } : {})
      });
      setEisotOutcome(outcome);
      await eisotBatches.refetch();
    } catch (e) {
      setEisotError(e instanceof Error ? e.message : 'Ошибка формирования выгрузки ЕИСОТ');
    } finally {
      setEisotBusy(false);
    }
  };

  const onDownloadEisot = async (batchId: string) => {
    if (!session) return;
    const { url } = await govExportApi.getEisotTestingBatchFileUrl(session, batchId);
    window.open(url, '_blank');
  };

  const onGenerateRostech = async () => {
    if (!session) return;
    setRostechBusy(true);
    setRostechError(null);
    try {
      const outcome = await govExportApi.createRostechnadzorExport(session, {
        ...(rostechGroupId ? { groupId: rostechGroupId } : {}),
        ...(rostechClientId ? { clientId: rostechClientId } : {}),
        ...(rostechFrom ? { enrolledFrom: rostechFrom } : {}),
        ...(rostechTo ? { enrolledTo: rostechTo } : {})
      });
      setRostechOutcome(outcome);
      await rostechBatches.refetch();
    } catch (e) {
      setRostechError(e instanceof Error ? e.message : 'Ошибка формирования выгрузки Ростехнадзор');
    } finally {
      setRostechBusy(false);
    }
  };

  const onDownloadRostech = async (batchId: string) => {
    if (!session) return;
    const { url } = await govExportApi.getRostechnadzorBatchFileUrl(session, batchId);
    window.open(url, '_blank');
  };

  const onGenerateNmo = async () => {
    if (!session) return;
    setNmoBusy(true);
    setNmoError(null);
    try {
      const outcome = await govExportApi.createNmoExport(session, {
        ...(nmoFrom ? { from: nmoFrom } : {}),
        ...(nmoTo ? { to: nmoTo } : {}),
        ...(nmoGroupId ? { groupId: nmoGroupId } : {})
      });
      setNmoOutcome(outcome);
      await nmoBatches.refetch();
    } catch (e) {
      setNmoError(e instanceof Error ? e.message : 'Ошибка формирования выгрузки НМО');
    } finally {
      setNmoBusy(false);
    }
  };

  const onDownloadNmo = async (batchId: string) => {
    if (!session) return;
    const { url } = await govExportApi.getNmoBatchFileUrl(session, batchId);
    window.open(url, '_blank');
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
          subtitle="Государственные выгрузки: XML, валидация, история"
        />
        <SectionCard title="Мастер формирования пакета">
          <FilterBar>
            <select value={providerCode} onChange={(event) => setProviderCode(event.target.value)}>
              <option value="frdo">ФРДО</option>
              <option value="eisot">ЕИСОТ</option>
            </select>
            <select value={exportType} onChange={(event) => setExportType(event.target.value)}>
              <option value="learners">Слушатели</option>
              <option value="courses">Курсы</option>
              <option value="groups">Группы</option>
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
          <p role="note" className="ui-callout ui-callout--warning" style={{ margin: '0 0 12px' }}>
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
                    key: 'signatureView',
                    title: 'Подпись',
                    render: (row) => row.signatureView
                  },
                  {
                    key: 'actionsView',
                    title: 'Действия',
                    render: (row) => row.actionsView
                  }
                ]}
                rows={otBatches.data.map((batch) => ({
                  ...batch,
                  signatureView: exportSignatureBadgeLabel(batch.signatureStatus),
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
        <SectionCard title="ФИС ФРДО (Рособрнадзор)">
          <p role="note" className="ui-callout ui-callout--warning" style={{ margin: '0 0 12px' }}>
            ⚠️ Формат выгрузки предварительный (не сверен с эталоном ФИС ФРДО). Перед подачей в
            реестр сверьте колонки с Excel-шаблоном в личном кабинете ФРДО.
          </p>
          <FilterBar>
            <input
              type="date"
              value={frdoFrom}
              onChange={(event) => setFrdoFrom(event.target.value)}
              placeholder="Дата выдачи с"
            />
            <input
              type="date"
              value={frdoTo}
              onChange={(event) => setFrdoTo(event.target.value)}
              placeholder="по"
            />
            <button type="button" onClick={() => void onGenerateFrdo()} disabled={frdoBusy}>
              {frdoBusy ? 'Формирование...' : 'Сформировать выгрузку ФРДО'}
            </button>
          </FilterBar>
          {frdoError ? <SectionError message={frdoError} /> : null}
          {frdoOutcome ? (
            <div>
              <p>
                Экспортировано: {frdoOutcome.exported} / {frdoOutcome.total}. Ошибок:{' '}
                {frdoOutcome.failed}.
              </p>
              {frdoOutcome.errors.length > 0 ? (
                <ul>
                  {frdoOutcome.errors.map((e) => (
                    <li key={`${e.documentId}-${e.field}`}>
                      {e.fullName || e.documentId}: {e.field} — {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <SectionCard title="История выгрузок ФРДО">
            {frdoBatches.loading ? <LoadingState message="Загрузка истории..." /> : null}
            {frdoBatches.error ? <SectionError message={frdoBatches.error} /> : null}
            {!frdoBatches.loading && !frdoBatches.error && !frdoBatches.data.length ? (
              <SectionEmpty message="Выгрузки отсутствуют" />
            ) : null}
            {frdoBatches.data.length ? (
              <DataTable
                columns={[
                  { key: 'id', title: 'ID' },
                  { key: 'batchStatus', title: 'Статус' },
                  { key: 'exportedRows', title: 'Экспортировано' },
                  { key: 'failedRows', title: 'Ошибок' },
                  { key: 'createdAt', title: 'Дата' },
                  {
                    key: 'signatureView',
                    title: 'Подпись',
                    render: (row) => row.signatureView
                  },
                  {
                    key: 'actionsView',
                    title: 'Действия',
                    render: (row) => row.actionsView
                  }
                ]}
                rows={frdoBatches.data.map((batch) => ({
                  ...batch,
                  signatureView: exportSignatureBadgeLabel(batch.signatureStatus),
                  actionsView: (
                    <button
                      type="button"
                      onClick={() => void onDownloadFrdo(batch.id)}
                      disabled={!batch.fileId}
                    >
                      Скачать
                    </button>
                  )
                }))}
              />
            ) : null}
          </SectionCard>
        </SectionCard>
        <SectionCard title="ЕИСОТ — лица на тестирование (Минтруд)">
          <p role="note" className="ui-callout ui-callout--warning" style={{ margin: '0 0 12px' }}>
            ⚠️ Формат выгрузки предварительный (не сверен с эталоном ЛКОТ). Перед подачей сверьте
            колонки с шаблоном в личном кабинете ЛКОТ (Минтруд).
          </p>
          <FilterBar>
            <input
              type="date"
              value={eisotFrom}
              onChange={(event) => setEisotFrom(event.target.value)}
              placeholder="Дата направления с"
            />
            <input
              type="date"
              value={eisotTo}
              onChange={(event) => setEisotTo(event.target.value)}
              placeholder="по"
            />
            <button type="button" onClick={() => void onGenerateEisot()} disabled={eisotBusy}>
              {eisotBusy ? 'Формирование...' : 'Сформировать выгрузку ЕИСОТ'}
            </button>
          </FilterBar>
          {eisotError ? <SectionError message={eisotError} /> : null}
          {eisotOutcome ? (
            <div>
              <p>
                Экспортировано: {eisotOutcome.exported} / {eisotOutcome.total}. Ошибок:{' '}
                {eisotOutcome.failed}.
              </p>
              {eisotOutcome.errors.length > 0 ? (
                <ul>
                  {eisotOutcome.errors.map((e) => (
                    <li key={`${e.enrollmentId}-${e.field}`}>
                      {e.fullName || e.learnerId}: {e.field} — {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <SectionCard title="История выгрузок ЕИСОТ">
            {eisotBatches.loading ? <LoadingState message="Загрузка истории..." /> : null}
            {eisotBatches.error ? <SectionError message={eisotBatches.error} /> : null}
            {!eisotBatches.loading && !eisotBatches.error && !eisotBatches.data.length ? (
              <SectionEmpty message="Выгрузки отсутствуют" />
            ) : null}
            {eisotBatches.data.length ? (
              <DataTable
                columns={[
                  { key: 'id', title: 'ID' },
                  { key: 'batchStatus', title: 'Статус' },
                  { key: 'exportedRows', title: 'Экспортировано' },
                  { key: 'failedRows', title: 'Ошибок' },
                  { key: 'createdAt', title: 'Дата' },
                  {
                    key: 'signatureView',
                    title: 'Подпись',
                    render: (row) => row.signatureView
                  },
                  {
                    key: 'actionsView',
                    title: 'Действия',
                    render: (row) => row.actionsView
                  }
                ]}
                rows={eisotBatches.data.map((batch) => ({
                  ...batch,
                  signatureView: exportSignatureBadgeLabel(batch.signatureStatus),
                  actionsView: (
                    <button
                      type="button"
                      onClick={() => void onDownloadEisot(batch.id)}
                      disabled={!batch.fileId}
                    >
                      Скачать
                    </button>
                  )
                }))}
              />
            ) : null}
          </SectionCard>
        </SectionCard>
        <SectionCard title="Ростехнадзор — аттестация по промышленной безопасности">
          <p role="note" className="ui-callout ui-callout--warning" style={{ margin: '0 0 12px' }}>
            ⚠️ Формат выгрузки предварительный (не сверен с эталоном Ростехнадзора). Перед подачей
            сверьте колонки и область аттестации.
          </p>
          <FilterBar>
            <input
              value={rostechGroupId}
              onChange={(event) => setRostechGroupId(event.target.value)}
              placeholder="ID группы (необязательно)"
            />
            <input
              value={rostechClientId}
              onChange={(event) => setRostechClientId(event.target.value)}
              placeholder="ID клиента (необязательно)"
            />
            <input
              type="date"
              value={rostechFrom}
              onChange={(event) => setRostechFrom(event.target.value)}
              placeholder="Дата зачисления с"
            />
            <input
              type="date"
              value={rostechTo}
              onChange={(event) => setRostechTo(event.target.value)}
              placeholder="по"
            />
            <button type="button" onClick={() => void onGenerateRostech()} disabled={rostechBusy}>
              {rostechBusy ? 'Формирование...' : 'Сформировать выгрузку Ростехнадзор'}
            </button>
          </FilterBar>
          {rostechError ? <SectionError message={rostechError} /> : null}
          {rostechOutcome ? (
            <div>
              <p>
                Экспортировано: {rostechOutcome.exported} / {rostechOutcome.total}. Ошибок:{' '}
                {rostechOutcome.failed}.
              </p>
              {rostechOutcome.errors.length > 0 ? (
                <ul>
                  {rostechOutcome.errors.map((e) => (
                    <li key={`${e.enrollmentId}-${e.field}`}>
                      {e.fullName || e.enrollmentId}: {e.field} — {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <SectionCard title="История выгрузок Ростехнадзор">
            {rostechBatches.loading ? <LoadingState message="Загрузка истории..." /> : null}
            {rostechBatches.error ? <SectionError message={rostechBatches.error} /> : null}
            {!rostechBatches.loading && !rostechBatches.error && !rostechBatches.data.length ? (
              <SectionEmpty message="Выгрузки отсутствуют" />
            ) : null}
            {rostechBatches.data.length ? (
              <DataTable
                columns={[
                  { key: 'id', title: 'ID' },
                  { key: 'batchStatus', title: 'Статус' },
                  { key: 'exportedRows', title: 'Экспортировано' },
                  { key: 'failedRows', title: 'Ошибок' },
                  { key: 'createdAt', title: 'Дата' },
                  {
                    key: 'signatureView',
                    title: 'Подпись',
                    render: (row) => row.signatureView
                  },
                  {
                    key: 'actionsView',
                    title: 'Действия',
                    render: (row) => row.actionsView
                  }
                ]}
                rows={rostechBatches.data.map((batch) => ({
                  ...batch,
                  signatureView: exportSignatureBadgeLabel(batch.signatureStatus),
                  actionsView: (
                    <button
                      type="button"
                      onClick={() => void onDownloadRostech(batch.id)}
                      disabled={!batch.fileId}
                    >
                      Скачать
                    </button>
                  )
                }))}
              />
            ) : null}
          </SectionCard>
        </SectionCard>
        <SectionCard title="Минздрав-НМО — непрерывное медобразование (ЗЕТ)">
          <p role="note" className="ui-callout ui-callout--warning" style={{ margin: '0 0 12px' }}>
            ⚠️ Формат выгрузки предварительный (не сверен с эталоном портала НМО). Специальность и
            ЗЕТ требуют проверки перед подачей.
          </p>
          <FilterBar>
            <input
              type="date"
              value={nmoFrom}
              onChange={(event) => setNmoFrom(event.target.value)}
              placeholder="Дата выдачи с"
            />
            <input
              type="date"
              value={nmoTo}
              onChange={(event) => setNmoTo(event.target.value)}
              placeholder="по"
            />
            <input
              value={nmoGroupId}
              onChange={(event) => setNmoGroupId(event.target.value)}
              placeholder="ID группы (необязательно)"
            />
            <button type="button" onClick={() => void onGenerateNmo()} disabled={nmoBusy}>
              {nmoBusy ? 'Формирование...' : 'Сформировать выгрузку НМО'}
            </button>
          </FilterBar>
          {nmoError ? <SectionError message={nmoError} /> : null}
          {nmoOutcome ? (
            <div>
              <p>
                Экспортировано: {nmoOutcome.exported} / {nmoOutcome.total}. Ошибок:{' '}
                {nmoOutcome.failed}.
              </p>
              {nmoOutcome.errors.length > 0 ? (
                <ul>
                  {nmoOutcome.errors.map((e) => (
                    <li key={`${e.documentId}-${e.field}`}>
                      {e.fullName || e.documentId}: {e.field} — {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <SectionCard title="История выгрузок НМО">
            {nmoBatches.loading ? <LoadingState message="Загрузка истории..." /> : null}
            {nmoBatches.error ? <SectionError message={nmoBatches.error} /> : null}
            {!nmoBatches.loading && !nmoBatches.error && !nmoBatches.data.length ? (
              <SectionEmpty message="Выгрузки отсутствуют" />
            ) : null}
            {nmoBatches.data.length ? (
              <DataTable
                columns={[
                  { key: 'id', title: 'ID' },
                  { key: 'batchStatus', title: 'Статус' },
                  { key: 'exportedRows', title: 'Экспортировано' },
                  { key: 'failedRows', title: 'Ошибок' },
                  { key: 'createdAt', title: 'Дата' },
                  {
                    key: 'signatureView',
                    title: 'Подпись',
                    render: (row) => row.signatureView
                  },
                  {
                    key: 'actionsView',
                    title: 'Действия',
                    render: (row) => row.actionsView
                  }
                ]}
                rows={nmoBatches.data.map((batch) => ({
                  ...batch,
                  signatureView: exportSignatureBadgeLabel(batch.signatureStatus),
                  actionsView: (
                    <button
                      type="button"
                      onClick={() => void onDownloadNmo(batch.id)}
                      disabled={!batch.fileId}
                    >
                      Скачать
                    </button>
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
