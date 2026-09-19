/**
 * Путь подключения учебного центра (ТЗ «Стабилизация, UX и развитие», 13.1).
 *
 * **Что просит ТЗ.** «Заявка на подключение → создание центра → мастер первого запуска (8.2) →
 * пробный период → переход на тариф. **Каждый шаг виден и центру, и администратору
 * платформы**».
 *
 * **Чего не хватало.** Все куски пути в продукте есть: центр заводится на экране арендаторов,
 * мастер первого запуска сделан в 8.2, статус `trial` существует, тариф назначается. Но ПУТИ
 * как целого нет нигде: администратор платформы видит список центров со статусами, центр видит
 * свой мастер — и ни один из них не видит, на каком шаге подключение застряло и чей сейчас ход
 * (журнал 557).
 *
 * **Почему путь описан данными, а не нарисован дважды.** Он показывается на ДВУХ экранах —
 * у центра и у администратора платформы. Нарисованный дважды, он разъедется при первой же
 * правке: один экран скажет «осталось настроить нумерацию», другой — «всё готово». Поэтому шаг
 * вычисляется здесь, а экраны только показывают.
 *
 * **Чей ход.** У каждого шага назван ответственный: половина задержек подключения — это «мы
 * ждали их, они ждали нас». Когда на экране написано «ход за центром», звонить не нужно.
 */

export type OnboardingStepId = 'request' | 'created' | 'setup' | 'trial' | 'paid';

export interface OnboardingPathStep {
  id: OnboardingStepId;
  title: string;
  /** Кто должен сделать следующий шаг. */
  owner: 'platform' | 'tenant';
  done: boolean;
}

export interface OnboardingPathInput {
  /** Статус центра: `trial`, `active`, `suspended`, `archived`. */
  tenantStatus: string;
  /** Закрыты ли обязательные шаги мастера первого запуска (8.2). */
  setupReady: boolean;
  /** Назначен ли тариф. */
  hasPlan: boolean;
  /** Есть ли исходная заявка на подключение. */
  fromRequest?: boolean;
}

export interface OnboardingPath {
  steps: OnboardingPathStep[];
  /** Текущий незакрытый шаг; `null` — путь пройден. */
  currentStepId: OnboardingStepId | null;
  /** Чей сейчас ход. */
  waitingFor: 'platform' | 'tenant' | null;
  /** Что сделать дальше — одной фразой, без кодов и без «обратитесь к администратору». */
  nextAction: string;
}

const STEP_TITLES: Record<OnboardingStepId, string> = {
  request: 'Заявка на подключение',
  created: 'Центр заведён',
  setup: 'Первая настройка центра',
  trial: 'Пробный период',
  paid: 'Переход на тариф'
};

const STEP_OWNERS: Record<OnboardingStepId, 'platform' | 'tenant'> = {
  request: 'platform',
  created: 'platform',
  setup: 'tenant',
  trial: 'tenant',
  paid: 'platform'
};

const NEXT_ACTION: Record<OnboardingStepId, string> = {
  request: 'Заявка ещё не обработана: администратор платформы заводит центр.',
  created: 'Центр заводится администратором платформы.',
  setup:
    'Центру осталось закрыть обязательные шаги первой настройки — до этого документы выдавать нельзя.',
  trial: 'Идёт пробный период: центр работает и решает, оставаться ли на платформе.',
  paid: 'Пробный период закончился: администратор платформы назначает тариф.'
};

/**
 * На каком шаге подключение.
 *
 * Архивный центр из пути выпадает: он не подключается, а закрыт. Приостановленный остаётся на
 * своём шаге — приостановка это пауза, а не откат к началу.
 */
export const onboardingPath = (input: OnboardingPathInput): OnboardingPath => {
  const archived = input.tenantStatus === 'archived';

  const done: Record<OnboardingStepId, boolean> = {
    /* Заявка считается закрытой всегда, когда центр уже существует: он и есть её результат. */
    request: true,
    created: true,
    setup: input.setupReady,
    /* Пробный период пройден, когда центр перестал быть пробным. */
    trial: input.setupReady && input.tenantStatus !== 'trial',
    paid: input.hasPlan && input.tenantStatus === 'active'
  };

  const steps: OnboardingPathStep[] = (
    ['request', 'created', 'setup', 'trial', 'paid'] as OnboardingStepId[]
  ).map((id) => ({ id, title: STEP_TITLES[id], owner: STEP_OWNERS[id], done: done[id] }));

  if (archived) {
    return {
      steps,
      currentStepId: null,
      waitingFor: null,
      nextAction: 'Центр в архиве: подключение не продолжается.'
    };
  }

  const current = steps.find((step) => !step.done);
  if (!current) {
    return {
      steps,
      currentStepId: null,
      waitingFor: null,
      nextAction: 'Подключение завершено: центр работает на тарифе.'
    };
  }

  return {
    steps,
    currentStepId: current.id,
    waitingFor: current.owner,
    nextAction: NEXT_ACTION[current.id]
  };
};
