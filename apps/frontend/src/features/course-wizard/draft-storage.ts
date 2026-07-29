import { type CourseWizardDraft, emptyDraft } from './wizard-state';

/**
 * Черновик мастера между шагами и между заходами (ФТ-E1, Фаза 2 Task 11b).
 *
 * Собрать курс за один присест методист не успевает: часы надо посмотреть в программе,
 * список модулей — согласовать. Потерять введённое из-за закрытой вкладки недопустимо,
 * поэтому черновик пишется в `localStorage` на каждое изменение.
 *
 * Ключ версионированный: при смене формы черновика старый просто перестаёт читаться,
 * а не ломает мастер «наполовину знакомыми» полями.
 */
export const COURSE_WIZARD_DRAFT_KEY = 'lms.course.wizard.draft.v2';

/**
 * Разбор сохранённого черновика. Любой сбой — пустой черновик, а не исключение:
 * испорченный localStorage не должен мешать создавать курс.
 */
export function parseDraft(raw: string | null): CourseWizardDraft {
  const base = emptyDraft();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<CourseWizardDraft> | null;
    if (!parsed || typeof parsed !== 'object') return base;

    return {
      ...base,
      ...pickStrings(parsed, base),
      sequentialModules: parsed.sequentialModules === true,
      noSeekOnFirstView: parsed.noSeekOnFirstView === true,
      modules: Array.isArray(parsed.modules) ? parsed.modules.map(normalizeModule) : []
    };
  } catch {
    return base;
  }
}

function pickStrings(
  parsed: Partial<CourseWizardDraft>,
  base: CourseWizardDraft
): Partial<CourseWizardDraft> {
  const result: Record<string, unknown> = {};
  for (const key of [
    'code',
    'title',
    'description',
    'directionId',
    'academicHours',
    'trainingType',
    'studyForm',
    'finalAssessmentForm',
    'videoCompletionPercent'
  ] as const) {
    const value = parsed[key];
    result[key] = typeof value === 'string' ? value : base[key];
  }
  return result as Partial<CourseWizardDraft>;
}

const MATERIAL_TYPES = ['file', 'external_url', 'text', 'video'] as const;

function normalizeModule(raw: unknown): CourseWizardDraft['modules'][number] {
  const source = (raw ?? {}) as Record<string, unknown>;
  return {
    title: typeof source.title === 'string' ? source.title : '',
    isRequired: source.isRequired !== false,
    materials: Array.isArray(source.materials) ? source.materials.map(normalizeMaterial) : []
  };
}

function normalizeMaterial(
  raw: unknown
): CourseWizardDraft['modules'][number]['materials'][number] {
  const source = (raw ?? {}) as Record<string, unknown>;
  const type = source.materialType;
  return {
    title: typeof source.title === 'string' ? source.title : '',
    materialType: (MATERIAL_TYPES as readonly unknown[]).includes(type)
      ? (type as (typeof MATERIAL_TYPES)[number])
      : 'text',
    minViewSeconds:
      typeof source.minViewSeconds === 'number' && Number.isFinite(source.minViewSeconds)
        ? Math.max(0, Math.round(source.minViewSeconds))
        : 0,
    isRequired: source.isRequired !== false
  };
}

/** Запись черновика; сбой хранилища (приватный режим, переполнение) не ломает мастер. */
export function saveDraft(draft: CourseWizardDraft, storage?: Storage): void {
  const store = storage ?? safeStorage();
  if (!store) return;
  try {
    store.setItem(COURSE_WIZARD_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* приватный режим или переполнение — молча продолжаем */
  }
}

export function loadDraft(storage?: Storage): CourseWizardDraft {
  const store = storage ?? safeStorage();
  if (!store) return emptyDraft();
  try {
    return parseDraft(store.getItem(COURSE_WIZARD_DRAFT_KEY));
  } catch {
    return emptyDraft();
  }
}

/** Чистим черновик только после успешного создания — иначе потеряем работу методиста. */
export function clearDraft(storage?: Storage): void {
  const store = storage ?? safeStorage();
  if (!store) return;
  try {
    store.removeItem(COURSE_WIZARD_DRAFT_KEY);
  } catch {
    /* см. saveDraft */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Доступ к localStorage бросает в некоторых приватных режимах — это не повод падать.
    return null;
  }
}
