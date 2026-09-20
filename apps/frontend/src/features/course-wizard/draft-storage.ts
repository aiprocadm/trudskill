import { type CourseWizardDraft, emptyDraft } from './wizard-state';
import { clearDraftIn, readDraftFrom, writeDraftTo } from '../../lib/forms/local-draft';

/**
 * Черновик мастера между шагами и между заходами (ФТ-E1, Фаза 2 Task 11b).
 *
 * Собрать курс за один присест методист не успевает: часы надо посмотреть в программе,
 * список модулей — согласовать. Потерять введённое из-за закрытой вкладки недопустимо,
 * поэтому черновик пишется в `localStorage` на каждое изменение.
 *
 * **ТЗ 10.3 (журнал 591): черновик ПРЕДЛАГАЕТСЯ, а не подставляется молча.** Раньше человек
 * открывал «Создание курса» и видел наполовину заполненную форму, не понимая, откуда она:
 * его это работа или чужая, вчерашняя или месячной давности. Дальше два исхода, и оба плохие
 * — он затирает нужное или создаёт второй такой же курс. Отметка времени и есть ответ на
 * «моё ли это»: человек помнит, когда он тут был.
 *
 * Ключ версионированный: при смене формы хранения старый просто перестаёт читаться,
 * а не ломает мастер «наполовину знакомыми» полями. `v3` — переход на запись с отметкой
 * времени; записи `v2` без отметки предложить нельзя (не на что опереться в ответе), поэтому
 * они не читаются и стираются при первом же открытии, чтобы не лежать вечно.
 */
export const COURSE_WIZARD_DRAFT_KEY = 'lms.course.wizard.draft.v3';
const LEGACY_DRAFT_KEY = 'lms.course.wizard.draft.v2';

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
export function saveDraft(draft: CourseWizardDraft, storage?: Storage, now?: Date): void {
  writeDraftTo(
    storage ?? safeStorage() ?? undefined,
    COURSE_WIZARD_DRAFT_KEY,
    draft,
    now ?? new Date()
  );
}

/**
 * Что лежит в черновике — БЕЗ подстановки в форму.
 *
 * Возвращает и сами данные, и когда их записали: решение «восстановить или начать заново»
 * принимает человек, а не мастер. Просроченный черновик стирается сразу — предлагать работу
 * недельной давности значит подсовывать незнакомый текст под видом своего.
 */
export function peekDraft(
  storage?: Storage,
  now?: Date
): { savedAt: Date; draft: CourseWizardDraft } | null {
  const store = storage ?? safeStorage() ?? undefined;
  /* Записи прежнего вида предложить нечем — убираем, чтобы не лежали вечно. */
  clearDraftIn(store, LEGACY_DRAFT_KEY);
  const state = readDraftFrom<unknown>(store, COURSE_WIZARD_DRAFT_KEY, now ?? new Date());
  if (state.status === 'stale') {
    clearDraft(storage);
    return null;
  }
  if (state.status !== 'ready') return null;
  return { savedAt: state.savedAt, draft: parseDraft(JSON.stringify(state.value)) };
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
