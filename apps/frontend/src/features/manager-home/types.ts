/**
 * Панель руководителя (ТЗ «Стабилизация, UX и развитие», 8.3).
 *
 * Четыре вопроса, вокруг которых ТЗ велит собрать кабинет: «как идёт обучение по моим
 * компаниям», «кто не успевает», «что горит по срокам», «сколько выдано документов».
 * Раньше кабинета не было вовсе: вход приводил руководителя прямо в список групп.
 */

export interface CompanyTraining {
  counterpartyId: string;
  companyName: string;
  groupsCount: number;
  learnersInTraining: number;
  completed: number;
  overdue: number;
  documentsIssued: number;
}

export interface LaggingLearner {
  learnerId: string;
  learnerName: string;
  groupId: string;
  groupName: string;
  companyName?: string;
  /** Отрицательное — срок уже вышел. */
  daysLeft: number;
  progressPercent: number;
  reason: 'overdue' | 'behind';
}

export interface GroupDueSoon {
  groupId: string;
  groupName: string;
  companyName?: string;
  dueAt: string;
  daysLeft: number;
  learnersCount: number;
}

export interface ManagerDashboard {
  asOf: string;
  horizonDays: number;
  totals: {
    companies: number;
    learnersInTraining: number;
    lagging: number;
    dueSoon: number;
    documentsIssued: number;
    groupsWithoutCompany: number;
  };
  companies: CompanyTraining[];
  lagging: LaggingLearner[];
  dueSoon: GroupDueSoon[];
}

/**
 * Почему человек попал в список отстающих — словами, а не кодом.
 *
 * `TXT-004`/правило продукта: ни одного англицизма как значения. «overdue» на экране не
 * объясняет ничего, а «Срок вышел» объясняет сразу и не требует легенды.
 */
export const LAGGING_REASON_TEXT: Record<LaggingLearner['reason'], string> = {
  overdue: 'Срок вышел',
  behind: 'Отстаёт от графика'
};

/** Запасная подпись: причина из будущей версии сервера не должна печататься кодом. */
export const LAGGING_REASON_FALLBACK = 'Требует внимания';

export const laggingReasonText = (reason: string): string =>
  LAGGING_REASON_TEXT[reason as LaggingLearner['reason']] ?? LAGGING_REASON_FALLBACK;

/**
 * Срок словами: «вышел 3 дн. назад» или «осталось 5 дн.».
 *
 * Отрицательное число дней на экране («-3 дн.») человек читает как опечатку, а не как
 * просрочку. Считается здесь, чтобы то же правило работало и в списке людей, и в списке групп.
 */
export const deadlineText = (daysLeft: number): string => {
  if (daysLeft < 0) return `срок вышел ${Math.abs(daysLeft)} дн. назад`;
  if (daysLeft === 0) return 'срок сегодня';
  return `осталось ${daysLeft} дн.`;
};

/**
 * Сколько групп осталось за пределами раздела компаний.
 *
 * Пустая строка — значит все группы привязаны к заказчику и оговорка не нужна. Показывать
 * «групп без компании: 0» значило бы тревожить человека ради нуля.
 */
export const groupsWithoutCompanyNote = (count: number): string =>
  count > 0
    ? `Групп без компании: ${count}. В этот список они не попали — привязка задаётся в карточке группы.`
    : '';
