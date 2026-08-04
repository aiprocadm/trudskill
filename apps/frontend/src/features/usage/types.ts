/** ФТ-D4.2 (Фаза 4 Task 5): экран «Использование» — зеркало ответа GET /tenant/usage. */

export interface UsageMetricDto {
  used: number;
  /** null = безлимит. */
  limit: number | null;
}

export interface PlanFeaturesDto {
  proctoring?: boolean;
  scorm?: boolean;
  api?: boolean;
  webinars?: boolean;
}

export interface TenantUsageDto {
  plan: { code: string; name: string; features: PlanFeaturesDto } | null;
  activeLearners: UsageMetricDto;
  staff: UsageMetricDto;
  storage: { usedBytes: number; limitBytes: number | null };
}

export const FEATURE_LABELS: Record<keyof PlanFeaturesDto, string> = {
  proctoring: 'Прокторинг',
  scorm: 'SCORM-курсы',
  api: 'Доступ по API',
  webinars: 'Вебинары'
};

export type UsageLevel = 'unlimited' | 'ok' | 'warning' | 'critical' | 'exceeded';

/**
 * Уровень тревоги по ТЗ D4.2: предупреждение с 80%, критично с 95%,
 * «исчерпано» — с 100% (новых слушателей уже не добавить).
 */
export const usageLevel = (used: number, limit: number | null): UsageLevel => {
  if (limit === null || limit <= 0) return 'unlimited';
  const ratio = used / limit;
  if (ratio >= 1) return 'exceeded';
  if (ratio >= 0.95) return 'critical';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
};

export const usagePercent = (used: number, limit: number | null): number | null =>
  limit === null || limit <= 0 ? null : Math.min(100, Math.round((used / limit) * 100));

/** Гигабайты для людей: 4294967296 → «4.0 ГБ». */
export const formatGb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
