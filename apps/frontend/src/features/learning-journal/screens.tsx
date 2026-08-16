'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import { fetchLearningJournalCsvUrl, learningJournalApi, toMinutes } from './api';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * Журнал учебных часов группы (ФТ-B3.4, Фаза 2 Task 8).
 *
 * Главное на экране — не «сколько часов у всех», а КТО НЕ ДОБРАЛ: именно этих слушателей
 * спрашивает инспектор. Поэтому они идут первыми (сортировка на сервере) и вынесены
 * отдельным списком под таблицей.
 */
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

  const download = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const url = await fetchLearningJournalCsvUrl(session, groupId);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выгрузить журнал');
    } finally {
      setBusy(false);
    }
  };

  const rows = (journal?.entries ?? []).map((entry) => ({
    ...entry,
    factTitle: `${entry.factHours} ак. ч`,
    planTitle: entry.plannedHours !== undefined ? `${entry.plannedHours} ак. ч` : '—',
    completionTitle: entry.completionPercent !== undefined ? `${entry.completionPercent}%` : '—',
    materialsTitle: `${toMinutes(entry.materialSeconds)} мин`,
    videoTitle: `${toMinutes(entry.videoSeconds)} мин`,
    testTitle: `${toMinutes(entry.testSeconds)} мин`,
    webinarTitle: `${toMinutes(entry.webinarSeconds)} мин`
  }));

  return (
    <SectionCard title="Журнал учебных часов">
      <p className="ui-text-muted">
        Фактическое время обучения против плановых часов программы. Академический час — 45 минут. На
        проверке просят файл, а не экран, — рядом кнопка выгрузки.
      </p>

      {journalQuery.error ? (
        <SectionError
          message={
            journalQuery.error instanceof Error
              ? journalQuery.error.message
              : 'Не удалось загрузить журнал'
          }
        />
      ) : null}
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
          <button type="button" onClick={() => void download()} disabled={busy}>
            Выгрузить CSV
          </button>
        </div>
      ) : null}

      {journal && !rows.length ? (
        <SectionEmpty
          message="В группе пока нет зачислений"
          hint="Журнал заполняется по мере зачисления слушателей в группу."
        />
      ) : null}

      {rows.length ? (
        <DataTable
          columns={[
            { key: 'learnerName', title: 'Слушатель' },
            { key: 'factTitle', title: 'Факт' },
            { key: 'planTitle', title: 'План' },
            { key: 'completionTitle', title: 'Выполнение' },
            { key: 'materialsTitle', title: 'Материалы' },
            { key: 'videoTitle', title: 'Видео' },
            { key: 'testTitle', title: 'Тесты' },
            { key: 'webinarTitle', title: 'Вебинары' }
          ]}
          rows={rows}
        />
      ) : null}

      {rows
        .filter((row) => row.belowPlan)
        .map((row) => (
          <div key={row.enrollmentId} className="ui-inline">
            <StatusChip status="inactive" />
            <span>
              {row.learnerName}: {row.factTitle} из {row.planTitle}
            </span>
          </div>
        ))}
    </SectionCard>
  );
}
