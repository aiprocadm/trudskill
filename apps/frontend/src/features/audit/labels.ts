/**
 * Читаемые подписи журнала действий (`TXT-006`).
 *
 * В журнале колонки назывались «Actor», «Action», «Entity», «Entity ID», а значениями стояли
 * коды: `learning.learner_created`, `assessment.attempt_started`. Человеку это ни о чём.
 *
 * Словарь на все действия завести нельзя — их десятки и они прибавляются. Но код построен
 * по образцу `раздел.объект_действие`, поэтому разбираем его по частям. Незнакомая часть
 * показывается как есть: потерять сведения хуже, чем показать код.
 *
 * ⚠️ Глагол согласуется с родом объекта. Без этого получалось «Попытка теста начат» —
 * интерфейс, говорящий на ломаном русском, ничем не лучше кода.
 */

type Gender = 'm' | 'f' | 'n';

const DOMAIN_LABELS: Record<string, string> = {
  learning: 'Обучение',
  assessment: 'Оценивание',
  documents: 'Документы',
  iam: 'Доступ',
  auth: 'Вход',
  org: 'Учебный центр',
  payments: 'Оплаты',
  notifications: 'Уведомления',
  integrations: 'Интеграции',
  esign: 'Подписание',
  regulatory: 'Отчётность',
  operations: 'Эксплуатация'
};

const OBJECTS: Record<string, { label: string; gender: Gender }> = {
  learner: { label: 'слушатель', gender: 'm' },
  group: { label: 'учебная группа', gender: 'f' },
  course: { label: 'курс', gender: 'm' },
  enrollment: { label: 'зачисление', gender: 'n' },
  module: { label: 'модуль', gender: 'm' },
  material: { label: 'материал', gender: 'm' },
  test: { label: 'тест', gender: 'm' },
  question: { label: 'вопрос', gender: 'm' },
  question_bank: { label: 'банк вопросов', gender: 'm' },
  assignment: { label: 'задание', gender: 'n' },
  assignment_review: { label: 'проверка работы', gender: 'f' },
  assignment_submission: { label: 'сданная работа', gender: 'f' },
  attempt: { label: 'попытка теста', gender: 'f' },
  exam_result: { label: 'итог экзамена', gender: 'm' },
  template: { label: 'шаблон документа', gender: 'm' },
  document: { label: 'документ', gender: 'm' },
  commission: { label: 'комиссия', gender: 'f' },
  counterparty: { label: 'компания-заказчик', gender: 'f' },
  order: { label: 'заказ', gender: 'm' },
  user: { label: 'пользователь', gender: 'm' },
  role: { label: 'роль', gender: 'f' },
  session: { label: 'сеанс входа', gender: 'm' }
};

/** Три формы каждого глагола: явно, а не правилом — русский язык правилу не поддаётся. */
const VERBS: Record<string, Record<Gender, string>> = {
  created: { m: 'заведён', f: 'заведена', n: 'заведено' },
  updated: { m: 'изменён', f: 'изменена', n: 'изменено' },
  deleted: { m: 'удалён', f: 'удалена', n: 'удалено' },
  archived: { m: 'отправлен в архив', f: 'отправлена в архив', n: 'отправлено в архив' },
  published: { m: 'опубликован', f: 'опубликована', n: 'опубликовано' },
  started: { m: 'начат', f: 'начата', n: 'начато' },
  finished: { m: 'завершён', f: 'завершена', n: 'завершено' },
  submitted: { m: 'отправлен', f: 'отправлена', n: 'отправлено' },
  completed: { m: 'завершён', f: 'завершена', n: 'завершено' },
  returned: {
    m: 'возвращён на доработку',
    f: 'возвращена на доработку',
    n: 'возвращено на доработку'
  },
  cancelled: { m: 'отменён', f: 'отменена', n: 'отменено' },
  revoked: { m: 'аннулирован', f: 'аннулирована', n: 'аннулировано' },
  reissued: { m: 'перевыпущен', f: 'перевыпущена', n: 'перевыпущено' },
  issued: { m: 'выдан', f: 'выдана', n: 'выдано' },
  saved: { m: 'сохранён', f: 'сохранена', n: 'сохранено' },
  expired: { m: 'просрочен', f: 'просрочена', n: 'просрочено' },
  verified: { m: 'подтверждён', f: 'подтверждена', n: 'подтверждено' },
  requested: { m: 'запрошен', f: 'запрошена', n: 'запрошено' },
  finalized: { m: 'подведён итог', f: 'подведён итог', n: 'подведён итог' },
  subscribed: { m: 'подписан', f: 'подписана', n: 'подписано' },
  unsubscribed: { m: 'отписан', f: 'отписана', n: 'отписано' }
};

const capitalize = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

export const domainLabel = (action: string): string => {
  const [domain] = action.split('.');
  return DOMAIN_LABELS[domain ?? ''] ?? domain ?? action;
};

/**
 * «Что произошло» человеческой фразой.
 *
 * `learning.learner_created` → «Слушатель заведён».
 * `assessment.attempt_started` → «Попытка теста начата».
 * Неизвестный код возвращается как есть.
 */
export const describeAction = (action: string): string => {
  const [, rest] = action.split('.');
  if (!rest) return action;

  const parts = rest.split('_');
  // Идём от самого длинного имени объекта: `question_bank_created` — это «банк вопросов»,
  // а не «вопрос», и разбор по первому слову дал бы неверную фразу.
  for (let take = parts.length - 1; take >= 1; take -= 1) {
    const object = OBJECTS[parts.slice(0, take).join('_')];
    const verb = VERBS[parts.slice(take).join('_')];
    if (object && verb) return `${capitalize(object.label)} ${verb[object.gender]}`;
  }
  return action;
};

/** Тип объекта в журнале приходит кодом (`learner`, `group`). */
export const entityLabel = (entityType: string): string => {
  const object = OBJECTS[entityType];
  return object ? capitalize(object.label) : entityType;
};
