/**
 * Файлы личного дела (ТЗ перехода §6.4 МГ-C2.1 «Файлы (до N=10, настройка; согласия, сканы)»;
 * срез 9.2, РМ94). Лимит и размер — настройка центра `org.tenant_settings.payload.learnerFiles`
 * со значениями по умолчанию (ТЗ стабилизации: всё, что похоже на число, — настройка).
 */
export const LEARNER_FILES_SETTINGS_KEY = 'learnerFiles';

export interface LearnerFilesSettings {
  /** Сколько файлов может быть у одного слушателя. */
  maxCount: number;
  /** Предел размера одного файла в байтах. */
  maxBytes: number;
}

const MB = 1024 * 1024;

export const DEFAULT_LEARNER_FILES_SETTINGS: LearnerFilesSettings = {
  maxCount: 10,
  maxBytes: 10 * MB
};

/** Согласия и сканы: PDF, картинки, Word. Архивы и исполняемые — нет. */
export const LEARNER_FILE_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const whole = (raw: unknown, fallback: number, min: number, max: number): number => {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  return rounded < min ? min : rounded > max ? max : rounded;
};

/** Снисходительный разбор: кривая настройка даёт значения по умолчанию, а не ломает карточку. */
export const resolveLearnerFilesSettings = (raw: unknown): LearnerFilesSettings => {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    maxCount: whole(rec.maxCount, DEFAULT_LEARNER_FILES_SETTINGS.maxCount, 1, 50),
    maxBytes: whole(rec.maxBytes, DEFAULT_LEARNER_FILES_SETTINGS.maxBytes, 1024, 50 * MB)
  };
};

export const learnerFilesSettingsFrom = (
  payload: Record<string, unknown> | undefined
): LearnerFilesSettings => resolveLearnerFilesSettings(payload?.[LEARNER_FILES_SETTINGS_KEY]);
