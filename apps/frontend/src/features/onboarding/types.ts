/**
 * ФТ-D2.3 (Фаза 4 Task 7): мастер онбординга учебного центра.
 *
 * Прогресс приходит с сервера и вычисляется из реальных данных — экран его только
 * показывает. Поэтому «продолжить» здесь не восстанавливает черновик, а ведёт на
 * первый незакрытый шаг: терять нечего, всё уже сохранено там, где ему место.
 */

export const ONBOARDING_STEP_IDS = [
  'requisites',
  'license',
  'branding',
  'commission',
  'template',
  'course'
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export interface OnboardingStepDto {
  id: OnboardingStepId;
  done: boolean;
  detail?: string;
}

export interface OnboardingStatusDto {
  steps: OnboardingStepDto[];
  doneCount: number;
  totalCount: number;
  nextStepId: OnboardingStepId | null;
  ready: boolean;
}

export interface OnboardingStepMeta {
  title: string;
  hint: string;
  /** Куда идти делать шаг — экран, который УЖЕ есть; мастер не дублирует формы. */
  href: string;
  /** Право, без которого шаг не сделать: подсказываем, к кому идти. */
  requiredPermission: string;
  /**
   * Как назвать нехватку доступа ЧЕЛОВЕКУ. Код права («documents.write») ему ничего не
   * говорит и просить по нему нечего — правило продукта запрещает сырые коды как значения.
   */
  accessLabel: string;
}

export const ONBOARDING_STEP_META: Record<OnboardingStepId, OnboardingStepMeta> = {
  requisites: {
    title: 'Реквизиты центра',
    hint: 'Название организации и ИНН — они попадают в удостоверения и протоколы.',
    href: '/academy/requisites',
    // Право ДЕЙСТВИЯ — сохранить реквизиты (PUT /tenant/requisites, 0083). Прежде стояло
    // `tenant.read`: мастер говорил «можно», а ручка отвечала отказом (журнал 343).
    requiredPermission: 'tenant.settings.write',
    accessLabel: 'к реквизитам центра'
  },
  license: {
    title: 'Лицензия и аккредитация',
    hint: 'Действующая образовательная лицензия: без неё документы выдавать нельзя.',
    href: '/admin/licenses',
    requiredPermission: 'org.licenses.write',
    accessLabel: 'к лицензиям и аккредитациям'
  },
  branding: {
    title: 'Логотип и цвета',
    hint: 'Название, логотип и фирменные цвета — в кабинете, письмах и проверке документов.',
    href: '/settings',
    requiredPermission: 'tenant.branding.configure',
    accessLabel: 'к оформлению центра'
  },
  commission: {
    title: 'Аттестационная комиссия',
    hint: 'Председатель и члены комиссии подписывают протоколы.',
    href: '/academy/commission',
    requiredPermission: 'learning.commissions.write',
    accessLabel: 'к аттестационной комиссии'
  },
  template: {
    title: 'Шаблоны документов',
    hint: 'Загрузите свой бланк удостоверения или протокола — по нему печатаются документы.',
    href: '/documents',
    // `documents.write` — право на загрузку бланка (POST /documents/templates). Прежде здесь
    // стояло `documents.templates` — имя ТАБЛИЦЫ, а не право: такого права нет ни у кого,
    // и шаг был недостижим даже для владельца центра (журнал 311).
    requiredPermission: 'documents.write',
    accessLabel: 'к шаблонам документов'
  },
  course: {
    title: 'Первый курс',
    hint: 'Создайте курс мастером — с программой, часами и правилами прохождения.',
    href: '/courses',
    requiredPermission: 'courses.write',
    accessLabel: 'к созданию курсов'
  }
};

/** Процент готовности для полосы прогресса. */
export const onboardingPercent = (status: OnboardingStatusDto): number =>
  status.totalCount <= 0 ? 0 : Math.round((status.doneCount / status.totalCount) * 100);

/**
 * Порядок показа: незакрытые шаги первыми, внутри группы — исходный порядок.
 * Администратор открывает экран, чтобы понять «что осталось», а не любоваться сделанным.
 */
export const orderStepsForDisplay = (steps: OnboardingStepDto[]): OnboardingStepDto[] => [
  ...steps.filter((step) => !step.done),
  ...steps.filter((step) => step.done)
];
