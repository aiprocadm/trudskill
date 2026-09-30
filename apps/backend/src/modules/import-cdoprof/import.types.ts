/**
 * Импорт из CDOPROF (ТЗ перехода §13.4, МГ-K3.1/K3.2; Фаза 4, срез 23.1).
 *
 * Запуск (`migration.import_runs`, 0100) — один проход по источнику; строка
 * (`migration.import_rows`) — одна запись источника и что с ней сделано. Действий у строки
 * четыре, как в таблице: `created | updated | skipped | failed`. В сухом прогоне это «что
 * будет сделано», данные центра не меняются (РМ132).
 */

export type ImportSource = 'api';
export type ImportDomain = 'counterparties' | 'learners';
export type ImportRunDomain = ImportDomain | 'all';
export type ImportRowAction = 'created' | 'updated' | 'skipped' | 'failed';
export type ImportRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

/** Замечание к строке, которое не мешает её перенести: человек увидит его в отчёте. */
export interface ImportRowNote {
  code: string;
  text: string;
}

/** Строка отчёта: одна запись источника. `raw` — обезличенная выжимка (ТЗ §17). */
export interface ImportRowPlan {
  domain: ImportDomain;
  sourceId: string;
  action: ImportRowAction;
  /** С кем сопоставлено (обновление) или на кого похоже (кандидат на слияние). */
  targetId?: string;
  /** Причина отказа или пропуска; у перенесённой строки — первое замечание. */
  errorCode?: string;
  errorText?: string;
  raw: Record<string, unknown>;
}

export interface ImportDomainStats {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Сколько пропущено как «кандидат на слияние» — их решает человек (РМ133). */
  mergeCandidates: number;
  /** Сколько строк перенесено с замечанием. */
  withNotes: number;
}

export interface ImportRunStats extends ImportDomainStats {
  byDomain: Partial<Record<ImportDomain, ImportDomainStats>>;
  /** «Повторить только ошибки»: чей запуск повторён. */
  retryOf?: string;
}

export interface ImportRun {
  id: string;
  tenantId: string;
  source: ImportSource;
  domain: ImportRunDomain;
  status: ImportRunStatus;
  dryRun: boolean;
  stats: ImportRunStats;
  startedBy?: string;
  /** Боевой прогон идёт фоновой задачей — её видно в разделе «Фоновые задачи». */
  backgroundTaskId?: string;
  errorText?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRow extends ImportRowPlan {
  id: string;
  runId: string;
  createdAt: string;
}

/** Код пропуска «уже перенесено, изменений нет» — так повтор отвечает на известные записи (МГ-K2.1). */
export const UNCHANGED = 'unchanged';

/** Код пропуска «похоже на уже известного — сливать решает человек» (РМ133). */
export const MERGE_CANDIDATE = 'merge_candidate';

export const emptyDomainStats = (): ImportDomainStats => ({
  total: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  mergeCandidates: 0,
  withNotes: 0
});

/** Итоги по строкам: общий счёт и по каждому домену. */
export const summarizeRows = (rows: readonly ImportRowPlan[]): ImportRunStats => {
  const total = emptyDomainStats();
  const byDomain: Partial<Record<ImportDomain, ImportDomainStats>> = {};
  for (const row of rows) {
    const domainStats = (byDomain[row.domain] ??= emptyDomainStats());
    for (const stats of [total, domainStats]) {
      stats.total += 1;
      stats[row.action] += 1;
      if (row.errorCode === MERGE_CANDIDATE) stats.mergeCandidates += 1;
      if ((row.action === 'created' || row.action === 'updated') && row.errorCode) {
        stats.withNotes += 1;
      }
    }
  }
  return { ...total, byDomain };
};
