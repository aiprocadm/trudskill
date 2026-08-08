/**
 * Отметки «планировщик отработал» (ФТ-I2, Фаза 6 Task 6).
 *
 * ЗАЧЕМ. В системе пять ночных планировщиков: напоминания о переаттестации, закрытие
 * просроченных попыток, счета аренды, чистка ПДн и чистка записей прокторинга. Все они
 * ловят свои ошибки внутрь журнала и молча идут дальше — то есть планировщик, который
 * перестал запускаться вообще (не тот cron, упавшая блокировка, отключённый флаг),
 * выглядит ровно как планировщик, которому нечего делать. Узнают об этом через месяц:
 * «почему никому не пришло напоминание».
 *
 * ЧТО ДЕЛАЕМ. Каждый прогон оставляет отметку: когда был, чем кончился. Отметки уходят
 * в /metrics как возраст последнего успеха. Молчание дольше своего интервала видно
 * глазами и ловится тревогой — а не звонком клиента.
 *
 * ПОЧЕМУ МОДУЛЬ, А НЕ СЕРВИС NEST. Планировщики создаются в юнит-тестах напрямую
 * (`new RemindersSchedulerService(...)`) с точным списком аргументов. Добавить шестой
 * или седьмой параметр в конструктор — переписать все эти тесты ради одной строчки
 * учёта. Модульный журнал вызывается изнутри метода и никому не меняет подпись.
 */

export type SchedulerOutcome = 'ok' | 'error';

export interface SchedulerRun {
  job: string;
  lastRunAt: number;
  lastSuccessAt: number | null;
  runs: number;
  failures: number;
  /** Ожидаемый интервал между прогонами, мс. Нужен, чтобы «молчит» считалось само. */
  expectedIntervalMs: number;
}

const runs = new Map<string, SchedulerRun>();

/** Сутки — интервал по умолчанию: четыре из пяти планировщиков ночные. */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const recordSchedulerRun = (
  job: string,
  outcome: SchedulerOutcome,
  options: { expectedIntervalMs?: number; now?: number } = {}
): SchedulerRun => {
  const now = options.now ?? Date.now();
  const previous = runs.get(job);
  const entry: SchedulerRun = {
    job,
    lastRunAt: now,
    lastSuccessAt: outcome === 'ok' ? now : (previous?.lastSuccessAt ?? null),
    runs: (previous?.runs ?? 0) + 1,
    failures: (previous?.failures ?? 0) + (outcome === 'error' ? 1 : 0),
    expectedIntervalMs:
      options.expectedIntervalMs ?? previous?.expectedIntervalMs ?? DEFAULT_INTERVAL_MS
  };
  runs.set(job, entry);
  return entry;
};

export const getSchedulerRuns = (): SchedulerRun[] => [...runs.values()];

/** Только для тестов: журнал живёт в памяти процесса и между тестами течёт. */
export const resetSchedulerRuns = (): void => {
  runs.clear();
};

/**
 * Просрочка считается с запасом вдвое: ночной прогон может сдвинуться на час-другой
 * из-за перезапуска или долгой чистки, и будить людей из-за этого не нужно.
 */
export const isSchedulerOverdue = (run: SchedulerRun, now: number): boolean =>
  now - (run.lastSuccessAt ?? run.lastRunAt) > run.expectedIntervalMs * 2;

export const renderSchedulerMetrics = (now: number = Date.now()): string => {
  const entries = getSchedulerRuns();
  if (entries.length === 0) {
    return '';
  }
  const lines: string[] = [
    '# HELP scheduler_last_success_age_seconds Seconds since the scheduled job last finished successfully',
    '# TYPE scheduler_last_success_age_seconds gauge'
  ];
  for (const run of entries) {
    const since = run.lastSuccessAt ?? run.lastRunAt;
    lines.push(
      `scheduler_last_success_age_seconds{job="${run.job}"} ${Math.floor((now - since) / 1000)}`
    );
  }
  lines.push(
    '# HELP scheduler_runs_total Scheduled job runs since process start',
    '# TYPE scheduler_runs_total counter'
  );
  for (const run of entries) {
    lines.push(`scheduler_runs_total{job="${run.job}",outcome="ok"} ${run.runs - run.failures}`);
    lines.push(`scheduler_runs_total{job="${run.job}",outcome="error"} ${run.failures}`);
  }
  lines.push(
    '# HELP scheduler_overdue Scheduled job has not succeeded within twice its interval',
    '# TYPE scheduler_overdue gauge'
  );
  for (const run of entries) {
    lines.push(`scheduler_overdue{job="${run.job}"} ${isSchedulerOverdue(run, now) ? 1 : 0}`);
  }
  return `${lines.join('\n')}\n`;
};
