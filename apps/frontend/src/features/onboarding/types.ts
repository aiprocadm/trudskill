/**
 * ФТ-D2.3 (Фаза 4 Task 7): мастер онбординга учебного центра.
 *
 * Прогресс приходит с сервера и вычисляется из реальных данных — экран его только
 * показывает. Поэтому «продолжить» здесь не восстанавливает черновик, а ведёт на
 * первый незакрытый шаг: терять нечего, всё уже сохранено там, где ему место.
 */

/*
 * ТЗ 8.2, решение владельца Р6: СЕМЬ шагов, из них пять обязательных. Раньше их было шесть, и
 * список не совпадал с решением: не хватало нумератора документов (обязательный!) и подписи с
 * печатью, зато был шаг «Логотип и цвета», которого Р6 не называет (журнал 528).
 *
 * Оформление убрано из мастера сознательно: это предмет задачи 13.3 «фирменный вид центра», а
 * не условие начала работы. Экран оформления остаётся доступен из настроек — из мастера ушёл
 * только пункт чек-листа, иначе индикатор «5 из 7» врал бы про восемь.
 */
export const ONBOARDING_STEP_IDS = [
  'requisites',
  'license',
  'commission',
  'template',
  'numbering',
  'signature',
  'course'
] as const;

/**
 * Обязательные шаги Р6: без них документы выдавать нельзя, и сервер это запрещает.
 *
 * Необязательные — подпись с печатью (документ выпускается без них в черновике), первый курс
 * (часто берётся из общей библиотеки) и оформление (предмет 13.3, а не условие работы).
 */
export const REQUIRED_STEP_IDS: readonly OnboardingStepId[] = [
  'requisites',
  'license',
  'commission',
  'template',
  'numbering'
];

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
  numbering: {
    title: 'Нумератор документов',
    hint: 'Правило, по которому документу присваивается номер: по нему документ находят в реестре.',
    href: '/documents',
    requiredPermission: 'documents.write',
    accessLabel: 'к нумерации документов'
  },
  signature: {
    title: 'Подпись и печать',
    hint: 'Изображения подписи руководителя и печати — подставляются в бланк. Без них документ выпускается в черновике.',
    href: '/academy/requisites',
    requiredPermission: 'tenant.settings.write',
    accessLabel: 'к реквизитам центра'
  },
  course: {
    title: 'Первый курс',
    hint: 'Создайте курс мастером — с программой, часами и правилами прохождения.',
    href: '/courses',
    requiredPermission: 'courses.write',
    accessLabel: 'к созданию курсов'
  }
};

/**
 * Сколько обязательных шагов закрыто — то, от чего зависит выдача документов (Р6).
 *
 * Общий счётчик «5 из 7» отвечает на вопрос «сколько осталось настроить», а этот — на вопрос
 * «можно ли уже работать». Смешивать их нельзя: центр с семью шагами из семи и центр с пятью
 * обязательными из пяти одинаково могут выдавать документы.
 */
export const requiredDone = (status: OnboardingStatusDto): { done: number; total: number } => {
  const required = status.steps.filter((step) => REQUIRED_STEP_IDS.includes(step.id));
  return { done: required.filter((step) => step.done).length, total: REQUIRED_STEP_IDS.length };
};

/** Можно ли выдавать документы: все обязательные шаги закрыты. */
export const canIssueDocuments = (status: OnboardingStatusDto): boolean => {
  const { done, total } = requiredDone(status);
  return done === total;
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
