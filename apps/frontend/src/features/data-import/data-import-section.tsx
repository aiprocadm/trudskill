'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BlockedHint,
  DataTable,
  LoadingState,
  StatusChip,
  blockedProps,
  useConfirmDialog
} from '@trudskill/ui';
import { useState } from 'react';

import { dataImportApi } from './api';
import { ImportReportDrawer } from './import-report-drawer';
import {
  DOMAIN_OPTIONS,
  canRetry,
  domainLabel,
  isRunActive,
  runChipStatus,
  runStatusLabel,
  runSummary
} from './model';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { formatDateTime, readApiMessage } from '../mvp/screen-helpers';

import type { ImportRunDomain, ImportRunDto } from './api';

/**
 * Настройки → «Перенос данных» (ТЗ перехода, МГ-K3.1; срез 23.5).
 *
 * Сценарий в два шага: сначала «Проверить без переноса» — отчёт покажет, что будет создано,
 * дополнено и что требует решения, ничего не меняя; затем «Перенести данные». Раздел виден
 * только с правом `import.run` (администратор центра).
 */
export function DataImportSection() {
  const { session } = useAuth();
  const canRun = hasPermission(session?.permissions ?? [], 'import.run');
  const queryClient = useQueryClient();
  const { ask, dialog } = useConfirmDialog();
  const startHint = 'data-import-start';
  const [domain, setDomain] = useState<ImportRunDomain>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<ImportRunDto | null>(null);

  const runsQuery = useQuery({
    queryKey: ['import-runs'],
    queryFn: () => dataImportApi.listImportRuns(session!),
    enabled: Boolean(session) && canRun,
    refetchInterval: 10_000,
    meta: { suppressGlobalErrorToast: true }
  });
  const runs = runsQuery.data ?? [];
  const active = runs.some(isRunActive);

  if (!session || !canRun) return null;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['import-runs'] });
      setNotice(success);
    } catch (err) {
      setError(readApiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const checkOnly = () =>
    void run(
      () => dataImportApi.startImportRun(session, { domain, dryRun: true }),
      'Проверка готова — откройте отчёт в списке ниже.'
    );

  const askTransfer = () =>
    ask(
      {
        title: 'Перенести данные',
        tone: 'danger',
        confirmLabel: 'Перенести данные',
        message:
          `Будет перенесено: «${domainLabel(domain)}». Записи заведутся в центре; удалить перенесённое ` +
          'одной кнопкой нельзя. Уже перенесённое повтор найдёт и не задвоит, а заполненное в центре не ' +
          'перезапишет. Сначала проверьте без переноса, если ещё не проверяли.'
      },
      () =>
        void run(
          () => dataImportApi.startImportRun(session, { domain, dryRun: false }),
          'Перенос данных запущен — он идёт в фоне, итог появится в списке ниже.'
        )
    );

  const retry = (item: ImportRunDto) =>
    void run(
      () => dataImportApi.retryImportRun(session, item.id),
      'Повтор строк с ошибками запущен — итог появится в списке ниже.'
    );

  const blockedReason = active ? 'Перенос уже идёт — дождитесь его окончания.' : undefined;
  const rows = runs.map((item) => ({
    ...item,
    startedView: formatDateTime(item.startedAt ?? item.createdAt),
    domainView: domainLabel(item.domain),
    modeView: item.dryRun
      ? 'Проверка без переноса'
      : item.stats?.retryOf
        ? 'Повтор ошибок'
        : 'Перенос',
    summaryView: item.errorText ?? runSummary(item)
  }));

  return (
    <SectionCard title="Перенос данных">
      <p className="ui-text-muted">
        Перенос компаний, слушателей, курсов, групп и зачислений из прежней системы обучения.
        Сначала проверьте без переноса: отчёт покажет, что будет создано, что дополнится и какие
        похожие записи нужно решить вручную. Ничего не удаляется и не перезаписывается.
      </p>

      <div className="ui-inline">
        <label className="ui-field">
          <span className="ui-field-label">Что переносить</span>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as ImportRunDomain)}
            style={{ maxWidth: '100%' }}
          >
            {DOMAIN_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {domainLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ui-inline">
        <button
          type="button"
          className={`ui-button ui-button--primary ${busy ? 'ui-button--loading' : ''}`}
          onClick={checkOnly}
          disabled={busy}
          {...blockedProps(startHint, blockedReason)}
        >
          Проверить без переноса
        </button>
        <button
          type="button"
          className="ui-button"
          onClick={askTransfer}
          disabled={busy}
          {...blockedProps(startHint, blockedReason)}
        >
          Перенести данные
        </button>
      </div>
      <BlockedHint hintKey={startHint} reason={blockedReason} />

      {runsQuery.error ? <SectionError error={runsQuery.error} /> : null}
      {error ? <SectionError message={error} /> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {runsQuery.isLoading ? <LoadingState message="Загрузка запусков…" /> : null}

      {!runsQuery.isLoading && rows.length ? (
        <DataTable
          columns={[
            { key: 'startedView', title: 'Запущен' },
            { key: 'domainView', title: 'Что переносили' },
            { key: 'modeView', title: 'Режим' },
            {
              key: 'status',
              title: 'Статус',
              render: (item) => (
                <StatusChip
                  status={runChipStatus(item.status)}
                  label={runStatusLabel(item.status)}
                />
              )
            },
            { key: 'summaryView', title: 'Итог' }
          ]}
          rows={rows}
          rowActions={(item) => [
            ...(isRunActive(item)
              ? []
              : [{ label: 'Открыть отчёт', onSelect: () => setReport(item) }]),
            ...(canRetry(item)
              ? [
                  {
                    label: 'Повторить только ошибки',
                    onSelect: () => retry(item),
                    disabled: busy || active
                  }
                ]
              : [])
          ]}
        />
      ) : null}
      {!runsQuery.isLoading && !rows.length && !runsQuery.error ? (
        <SectionEmpty
          message="Переносов ещё не было"
          hint="Начните с «Проверить без переноса»: отчёт покажет, что перенесётся, ничего не меняя в центре."
        />
      ) : null}

      {report ? <ImportReportDrawer run={report} onClose={() => setReport(null)} /> : null}
      {dialog}
    </SectionCard>
  );
}
