import { parseRecertMonths } from '../recertification/expiring';

import type { FinalAssessmentForm, StudyForm, TrainingType } from '../mvp/types';

/**
 * Мастер создания курса (ФТ-E1, Фаза 2 Task 11b).
 *
 * **Что было.** Экран «Создание курса» рисовал степпер из трёх шагов, но все поля лежали
 * на одной форме, а создавалась только карточка курса. Программу, часы, модули,
 * материалы и правила прохождения методист потом добивал по разным экранам — то есть
 * «мастера» не существовало, была его картинка.
 *
 * **Что здесь.** Вся логика мастера — чистые функции: шаги, проверка каждого шага,
 * черновик и план создания. React-обёртка остаётся тонкой, а поведение проверяется
 * обычными тестами (React Testing Library в проекте нет — конвенция CLAUDE.md).
 */

export const WIZARD_STEPS = ['card', 'program', 'structure', 'rules', 'review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_TITLES: Record<WizardStep, string> = {
  card: 'Карточка курса',
  program: 'Программа и часы',
  structure: 'Модули и материалы',
  rules: 'Правила прохождения',
  review: 'Проверка и создание'
};

export interface WizardMaterialDraft {
  title: string;
  materialType: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds: number;
  isRequired: boolean;
}

export interface WizardModuleDraft {
  title: string;
  isRequired: boolean;
  materials: WizardMaterialDraft[];
}

export interface CourseWizardDraft {
  code: string;
  title: string;
  description: string;
  directionId: string;
  academicHours: string;
  /** ФТ-E4: срок действия удостоверения, мес. Пусто = бессрочно. */
  recertificationPeriodMonths: string;
  trainingType: TrainingType | '';
  studyForm: StudyForm | '';
  finalAssessmentForm: FinalAssessmentForm | '';
  modules: WizardModuleDraft[];
  sequentialModules: boolean;
  noSeekOnFirstView: boolean;
  videoCompletionPercent: string;
}

export const emptyDraft = (): CourseWizardDraft => ({
  code: '',
  title: '',
  description: '',
  directionId: '',
  academicHours: '',
  recertificationPeriodMonths: '',
  trainingType: '',
  studyForm: '',
  finalAssessmentForm: '',
  modules: [],
  sequentialModules: false,
  noSeekOnFirstView: false,
  videoCompletionPercent: ''
});

export interface WizardFieldError {
  field: string;
  message: string;
}

/**
 * Проверка одного шага. Возвращает список ошибок — пустой список означает «дальше можно».
 *
 * Проверяем ровно то, что нужно СЕЙЧАС: заставлять методиста заполнить часы, чтобы
 * ввести название курса, значит превратить мастер в анкету.
 */
export function validateStep(step: WizardStep, draft: CourseWizardDraft): WizardFieldError[] {
  const errors: WizardFieldError[] = [];

  if (step === 'card') {
    // Те же пороги, что и в прежней форме создания курса — поведение не меняем.
    if (draft.code.trim().length < 2) {
      errors.push({ field: 'code', message: 'Код курса: минимум 2 символа' });
    }
    if (draft.title.trim().length < 3) {
      errors.push({ field: 'title', message: 'Название: минимум 3 символа' });
    }
  }

  if (step === 'program') {
    const hours = Number(draft.academicHours);
    // Часы — не украшение: на них опирается журнал учебных часов (ФТ-B3.4), без них
    // инспектору нечего показать. Но обязательными делаем только положительные числа.
    if (draft.academicHours && (!Number.isFinite(hours) || hours <= 0)) {
      errors.push({ field: 'academicHours', message: 'Часы: положительное число' });
    }
    // ФТ-E4: периодичность переобучения. Пусто = бессрочно и ошибкой не считается.
    if (
      draft.recertificationPeriodMonths &&
      !parseRecertMonths(draft.recertificationPeriodMonths).valid
    ) {
      errors.push({
        field: 'recertificationPeriodMonths',
        message: 'Периодичность: целое число месяцев от 1 до 120 или пусто (бессрочно)'
      });
    }
  }

  if (step === 'structure') {
    if (!draft.modules.length) {
      errors.push({ field: 'modules', message: 'Добавьте хотя бы один модуль' });
    }
    draft.modules.forEach((module, index) => {
      if (module.title.trim().length < 2) {
        errors.push({
          field: `modules.${index}.title`,
          message: `Модуль ${index + 1}: название минимум 2 символа`
        });
      }
      module.materials.forEach((material, materialIndex) => {
        if (material.title.trim().length < 2) {
          errors.push({
            field: `modules.${index}.materials.${materialIndex}.title`,
            message: `Модуль ${index + 1}, материал ${materialIndex + 1}: название минимум 2 символа`
          });
        }
      });
    });
  }

  if (step === 'rules') {
    const percent = Number(draft.videoCompletionPercent);
    if (
      draft.videoCompletionPercent &&
      (!Number.isFinite(percent) || percent < 1 || percent > 100)
    ) {
      errors.push({
        field: 'videoCompletionPercent',
        message: 'Порог зачёта видео: число от 1 до 100'
      });
    }
    // Строгий порядок модулей без обязательных материалов запер бы курс на первом же
    // модуле: пройти нечего, значит следующий не откроется никогда.
    if (draft.sequentialModules) {
      const hasRequired = draft.modules.some((module) =>
        module.materials.some((material) => material.isRequired)
      );
      if (!hasRequired) {
        errors.push({
          field: 'sequentialModules',
          message:
            'Строгий порядок требует хотя бы одного обязательного материала — иначе курс не откроется дальше первого модуля'
        });
      }
    }
  }

  return errors;
}

/** Индекс шага; неизвестный шаг трактуется как первый, а не как ошибка. */
export function stepIndex(step: WizardStep): number {
  const index = WIZARD_STEPS.indexOf(step);
  return index < 0 ? 0 : index;
}

/** Следующий шаг, если текущий заполнен верно; иначе остаёмся на месте. */
export function nextStep(step: WizardStep, draft: CourseWizardDraft): WizardStep {
  if (validateStep(step, draft).length) return step;
  const index = stepIndex(step);
  return WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]!;
}

/** Назад пускаем всегда: вернуться и поправить введённое — не ошибка. */
export function prevStep(step: WizardStep): WizardStep {
  return WIZARD_STEPS[Math.max(stepIndex(step) - 1, 0)]!;
}

/** Можно ли перейти на шаг напрямую (клик по степперу): только на пройденные и текущий. */
export function canJumpTo(target: WizardStep, current: WizardStep): boolean {
  return stepIndex(target) <= stepIndex(current);
}

/** Все ошибки мастера — то, что показывается на шаге «Проверка». */
export function validateAll(draft: CourseWizardDraft): WizardFieldError[] {
  return WIZARD_STEPS.filter((step) => step !== 'review').flatMap((step) =>
    validateStep(step, draft)
  );
}

/**
 * План создания — что именно мастер отправит на сервер и в каком порядке.
 *
 * Вынесен отдельно, чтобы порядок вызовов проверялся тестом: версия курса создаётся
 * ПОСЛЕ курса, метаданные программы пишутся В ВЕРСИЮ, модули — в неё же. Перепутанный
 * порядок дал бы наполовину созданный курс, который методисту пришлось бы доделывать руками.
 */
export interface CourseCreationPlan {
  course: { code: string; title: string; description: string; directionId?: string };
  programMeta: {
    academicHours: number | null;
    /** ФТ-E4: null = удостоверение бессрочно, напоминания о переобучении не шлются. */
    recertificationPeriodMonths: number | null;
    trainingType: TrainingType | null;
    studyForm: StudyForm | null;
    finalAssessmentForm: FinalAssessmentForm | null;
    sequentialModules: boolean;
    noSeekOnFirstView: boolean;
    videoCompletionPercent: number | null;
  };
  modules: Array<{
    title: string;
    sortOrder: number;
    isRequired: boolean;
    materials: Array<{
      title: string;
      materialType: WizardMaterialDraft['materialType'];
      sortOrder: number;
      minViewSeconds: number;
      isRequired: boolean;
    }>;
  }>;
}

export function buildCreationPlan(draft: CourseWizardDraft): CourseCreationPlan {
  const hours = Number(draft.academicHours);
  const percent = Number(draft.videoCompletionPercent);
  const recertMonths = parseRecertMonths(draft.recertificationPeriodMonths);
  return {
    course: {
      code: draft.code.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      ...(draft.directionId ? { directionId: draft.directionId } : {})
    },
    programMeta: {
      academicHours: draft.academicHours && Number.isFinite(hours) && hours > 0 ? hours : null,
      recertificationPeriodMonths: recertMonths.valid ? recertMonths.months : null,
      trainingType: draft.trainingType || null,
      studyForm: draft.studyForm || null,
      finalAssessmentForm: draft.finalAssessmentForm || null,
      sequentialModules: draft.sequentialModules,
      noSeekOnFirstView: draft.noSeekOnFirstView,
      videoCompletionPercent:
        draft.videoCompletionPercent && Number.isFinite(percent) && percent >= 1 && percent <= 100
          ? Math.round(percent)
          : null
    },
    // Порядок модулей и материалов — от их места в черновике: методист расставил их
    // сам, и менять этот порядок мастеру нельзя (от него зависит строгий порядок ФТ-E1).
    modules: draft.modules.map((module, index) => ({
      title: module.title.trim(),
      sortOrder: index,
      isRequired: module.isRequired,
      materials: module.materials.map((material, materialIndex) => ({
        title: material.title.trim(),
        materialType: material.materialType,
        sortOrder: materialIndex,
        minViewSeconds: Number.isFinite(material.minViewSeconds)
          ? Math.max(0, Math.round(material.minViewSeconds))
          : 0,
        isRequired: material.isRequired
      }))
    }))
  };
}
