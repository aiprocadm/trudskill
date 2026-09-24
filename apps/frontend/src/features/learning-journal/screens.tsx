'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import { fetchLearningJournalFileUrl, learningJournalApi, toMinutes } from './api';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import {
  ENROLLMENT_RESULT_LABEL,
  ENROLLMENT_STATUS_LABEL,
  formatDate
} from '../mvp/screen-helpers';

import type { LearningJournalEntryDto, LearningJournalFileFormat } from './api';

/**
 * Статистика посещений и учебные часы группы (ФТ-B3.4 + МГ-B4.2, срез 8.8).
 *
 * Главное на экране — не «сколько часов у всех», а КТО НЕ ДОБРАЛ: именно этих слушателей
 * спрашивает инспектор. Поэтому они идут первыми (сортировка на сервере) и вынесены
 * отдельным списком под таблицей. Поверх часов — то, что смотрел куратор в CDOPROF:
 * последний вход, прогресс, попытки, итог. Раскладка минут по видам активности
 * (материалы, видео, тесты, вебинары) — в файле: на экране бюджет ≤7 колонок (журнал 636).
 */

/** Итог строки словом: «не явился» важнее балла (РМ67). */
export const journalResultLabel = (entry: LearningJournalEntryDto): string => {
  if (entry.resultCode) return ENROLLMENT_RESULT_LABEL[entry.resultCode] ?? entry.resultCode;
  if (entry.examPassed) return 'Сдал';
  return '—';
};

/** Попытки одной строкой: «2 · лучший 17 из 20» — считать и сравнивать не нужно. */
export const journalAttemptsLabel = (entry: LearningJournalEntryDto): string => {
  if (entry.attemptsCount === 0) return 'не было';
  const best =
    entry.bestScore !== undefined
      ? ` · лучший ${entry.bestScore}${entry.maxScore !== undefined ? ` из ${entry.maxScore}` : ''}`
      : '';
  return `${entry.attemptsCount}${best}`;
};

export function LearningJournalSection({ groupId }: { groupId: string }) {
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const journalQuery = useQuery({
    queryKey: ['learning-journal', session?.user.id, groupId],
    enabled: Boolean(session && groupId),
    queryFn: () => learningJournalApi.get(session!, groupId)
  });

  const journal = journalQuery.data;

  const download = async (format: LearningJournalFileFormat) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const url = await fetchLearningJournalFileUrl(session, groupId, format);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выгрузить статистику');
    } finally {
      setBusy(false);
    }
  };

  const rows = (journal?.entries ?? []).map((entry) => ({
    ...entry,
    statusTitle: ENROLLMENT_STATUS_LABEL[entry.enrollmentStatus] ?? entry.enrollmentStatus,
    lastLoginTitle: entry.lastLoginAt ? formatDate(entry.lastLoginAt) : 'не входил',
    progressTitle: entry.progressPercent !== undefined ? `${entry.progressPercent}%` : '—',
    hoursTitle:
      entry.plannedHours !== undefined
        ? `${entry.factHours} из ${entry.plannedHours} ак. ч`
        : `${entry.factHours} ак. ч`,
    attemptsTitle: journalAttemptsLabel(entry),
    resultTitle: journalResultLabel(entry),
    factTitle: `${entry.factHours} ак. ч`,
    planTitle: entry.plannedHours !== undefined ? `${entry.plannedHours} ак. ч` : '—'
  }));

  return (
    <SectionCard title="Статистика посещений и часы">
      <p className="ui-text-muted">
        Последний вход, прогресс, попытки и фактическое время обучения против плановых часов
        программы (академический час — 45 минут). Раскладка минут по материалам, видео, тестам и
        вебинарам — в выгрузке. На проверке просят файл, а не экран, — рядом кнопки выгрузки.
      </p>

      {journalQuery.error ? <SectionError error={journalQuery.error} /> : null}
      {error ? <SectionError message={error} /> : null}
      {journalQuery.isLoading ? <LoadingState message="Считаем часы…" /> : null}

      {journal ? (
        <div className="ui-inline">
          <span>План: {journal.plannedAcademicHours ?? '—'} ак. ч</span>
          {journal.belowPlanCount > 0 ? (
            <span className="ui-error" data-testid="learning-journal-below-plan">
              Не добрали часы: {journal.belowPlanCount}
            </span>
          ) : (
            <span className="ui-text-muted">Все слушатели выполнили план</span>
          )}
          <button
            type="button"
            className="ui-button"
            onClick={() => void download('xlsx')}
            disabled={busy}
          >
            Выгрузить XLSX
          </button>
          <button
            type="button"
            className="ui-button-link"
            onClick={() => void download('csv')}
            disabled={busy}
          >
            Выгрузить CSV
          </button>
        </div>
      ) : null}

      {journal && !rows.length ? (
        <SectionEmpty
          message="В группе пока нет зачислений"
          hint="Статистика заполняется по мере зачисления слушателей в группу."
        />
      ) : null}

      {rows.length ? (
        <DataTable
          columns={[
            { key: 'learnerName', title: 'Слушатель' },
            { key: 'statusTitle', title: 'Статус' },
            { key: 'lastLoginTitle', title: 'Последний вход' },
            { key: 'progressTitle', title: 'Прогресс' },
            { key: 'hoursTitle', title: 'Часы' },
            { key: 'attemptsTitle', title: 'Попытки' },
            { key: 'resultTitle', title: 'Итог' }
          ]}
          rows={rows}
          rowKey={(row) => row.enrollmentId}
        />
      ) : null}

      {rows
        .filter((row) => row.belowPlan)
        .map((row) => (
          <div key={row.enrollmentId} className="ui-inline">
            <StatusChip status="inactive" />
            <span>
              {row.learnerName}: {row.factTitle} из {row.planTitle} — материалы{' '}
              {toMinutes(row.materialSeconds)} мин, видео {toMinutes(row.videoSeconds)} мин, тесты{' '}
              {toMinutes(row.testSeconds)} мин, вебинары {toMinutes(row.webinarSeconds)} мин
            </span>
          </div>
        ))}
    </SectionCard>
  );
}
