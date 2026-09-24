import { DEFAULT_GROUP_CODE_PATTERN, isValidGroupCodePattern } from './group-code.js';

/**
 * Значения по умолчанию для новой группы из настроек центра (ТЗ перехода §6.1 МГ-B1.1,
 * аналог `set_groups` CDOPROF): `org.tenant_settings.payload.groupDefaults` и
 * `payload.groupCodePattern`. Непонятное значение — значение по умолчанию, а не «как получится».
 */
export const GROUP_DEFAULTS_SETTINGS_KEY = 'groupDefaults';
export const GROUP_CODE_PATTERN_SETTINGS_KEY = 'groupCodePattern';

export const STUDY_FORMS = ['distance', 'in_person', 'blended'] as const;
export type StudyForm = (typeof STUDY_FORMS)[number];
export const ACCESS_MODES = ['normal', 'always_closed', 'always_open', 'from_creation'] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];
export const ENROLLMENT_MODES = ['auto', 'manual'] as const;
export type EnrollmentMode = (typeof ENROLLMENT_MODES)[number];
/** Окно доступа к экзамену по умолчанию: весь период обучения или только день экзамена. */
export const EXAM_ACCESS_WINDOWS = ['whole_period', 'exam_day'] as const;
export type ExamAccessWindow = (typeof EXAM_ACCESS_WINDOWS)[number];

export interface GroupDefaults {
  studyForm: StudyForm;
  isDot: boolean;
  accessMode: AccessMode;
  enrollmentMode: EnrollmentMode;
  remoteSignature: boolean;
  requireIdentity: boolean;
  examAccessWindow: ExamAccessWindow;
  notifyOnPass: { email: boolean; inApp: boolean };
  /** Срок обучения по умолчанию (дней), когда у курса нет своего. */
  periodDays: number;
}

export const DEFAULT_GROUP_DEFAULTS: GroupDefaults = {
  studyForm: 'distance',
  isDot: true,
  accessMode: 'normal',
  enrollmentMode: 'auto',
  remoteSignature: false,
  requireIdentity: false,
  examAccessWindow: 'whole_period',
  notifyOnPass: { email: true, inApp: true },
  periodDays: 30
};

const oneOf = <T extends string>(raw: unknown, allowed: ReadonlyArray<T>, fallback: T): T =>
  typeof raw === 'string' && (allowed as ReadonlyArray<string>).includes(raw)
    ? (raw as T)
    : fallback;
const flag = (raw: unknown, fallback: boolean): boolean =>
  typeof raw === 'boolean' ? raw : fallback;
const days = (raw: unknown, fallback: number): number => {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const whole = Math.floor(value);
  return whole < 1 ? 1 : whole > 730 ? 730 : whole;
};

export function resolveGroupDefaults(raw: unknown): GroupDefaults {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const notify = (
    source.notifyOnPass && typeof source.notifyOnPass === 'object' ? source.notifyOnPass : {}
  ) as Record<string, unknown>;
  return {
    studyForm: oneOf(source.studyForm, STUDY_FORMS, DEFAULT_GROUP_DEFAULTS.studyForm),
    isDot: flag(source.isDot, DEFAULT_GROUP_DEFAULTS.isDot),
    accessMode: oneOf(source.accessMode, ACCESS_MODES, DEFAULT_GROUP_DEFAULTS.accessMode),
    enrollmentMode: oneOf(
      source.enrollmentMode,
      ENROLLMENT_MODES,
      DEFAULT_GROUP_DEFAULTS.enrollmentMode
    ),
    remoteSignature: flag(source.remoteSignature, DEFAULT_GROUP_DEFAULTS.remoteSignature),
    requireIdentity: flag(source.requireIdentity, DEFAULT_GROUP_DEFAULTS.requireIdentity),
    examAccessWindow: oneOf(
      source.examAccessWindow,
      EXAM_ACCESS_WINDOWS,
      DEFAULT_GROUP_DEFAULTS.examAccessWindow
    ),
    notifyOnPass: {
      email: flag(notify.email, DEFAULT_GROUP_DEFAULTS.notifyOnPass.email),
      inApp: flag(notify.inApp, DEFAULT_GROUP_DEFAULTS.notifyOnPass.inApp)
    },
    periodDays: days(source.periodDays, DEFAULT_GROUP_DEFAULTS.periodDays)
  };
}

export function resolveGroupCodePattern(raw: unknown): string {
  return isValidGroupCodePattern(raw) ? raw.trim() : DEFAULT_GROUP_CODE_PATTERN;
}

/** Куда ложатся значения по умолчанию — подмножество полей группы. */
export interface GroupDefaultsTarget {
  startDate?: string;
  endDate?: string;
  examDate?: string;
  examAccessFrom?: string;
  examAccessTo?: string;
  studyForm?: string;
  isDot?: boolean;
  accessMode?: string;
  enrollmentMode?: string;
  remoteSignature?: boolean;
  requireIdentity?: boolean;
  notifyOnPass?: { email?: boolean; inApp?: boolean };
}

const addDaysTo = (date: string, days: number): string => {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

/**
 * Дописать новой группе то, чего не прислали (МГ-B1.1, мастер §6.2): форма, ДОТ, режимы,
 * уведомления — из настроек; окончание = начало + срок по умолчанию; экзамен = окончание;
 * окно доступа к экзамену — весь период или день экзамена. Присланное не трогается.
 */
export function applyGroupDefaults<T extends GroupDefaultsTarget>(
  group: T,
  defaults: GroupDefaults
): T {
  if (group.studyForm === undefined) group.studyForm = defaults.studyForm;
  if (group.isDot === undefined) group.isDot = defaults.isDot;
  if (group.accessMode === undefined) group.accessMode = defaults.accessMode;
  if (group.enrollmentMode === undefined) group.enrollmentMode = defaults.enrollmentMode;
  if (group.remoteSignature === undefined) group.remoteSignature = defaults.remoteSignature;
  if (group.requireIdentity === undefined) group.requireIdentity = defaults.requireIdentity;
  if (group.notifyOnPass === undefined) group.notifyOnPass = { ...defaults.notifyOnPass };
  if (group.startDate && group.endDate === undefined) {
    group.endDate = addDaysTo(group.startDate, defaults.periodDays);
  }
  if (group.endDate && group.examDate === undefined) group.examDate = group.endDate;
  if (group.examDate && group.examAccessFrom === undefined && group.examAccessTo === undefined) {
    const from =
      defaults.examAccessWindow === 'exam_day'
        ? group.examDate
        : (group.startDate ?? group.examDate);
    const to =
      defaults.examAccessWindow === 'exam_day' ? group.examDate : (group.endDate ?? group.examDate);
    group.examAccessFrom = `${from}T00:00:00.000Z`;
    group.examAccessTo = `${to}T23:59:59.000Z`;
  }
  return group;
}

/** Настройки группы центра, которые контроллер передаёт в сервис при создании. */
export interface GroupCreationSettings {
  codePattern: string;
  defaults: GroupDefaults;
}

export const DEFAULT_GROUP_CREATION_SETTINGS: GroupCreationSettings = {
  codePattern: DEFAULT_GROUP_CODE_PATTERN,
  defaults: DEFAULT_GROUP_DEFAULTS
};

/** Из свободного `payload` настроек центра — шаблон кода и значения по умолчанию. */
export function groupCreationSettingsFrom(payload: unknown): GroupCreationSettings {
  const source = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  return {
    codePattern: resolveGroupCodePattern(source[GROUP_CODE_PATTERN_SETTINGS_KEY]),
    defaults: resolveGroupDefaults(source[GROUP_DEFAULTS_SETTINGS_KEY])
  };
}
