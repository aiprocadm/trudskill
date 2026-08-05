/**
 * ФТ-G6 (Фаза 4 Task 12): права субъекта персональных данных — 152-ФЗ.
 *
 * **Ключевое решение: отзыв согласия обезличивает карточку, но НЕ трогает выданные
 * документы.** Это не компромисс ради удобства, а требование закона: обработка ПДн в
 * протоколах и удостоверениях идёт по основанию «исполнение обязанности, установленной
 * законодательством» (152-ФЗ ст. 6 ч. 1 п. 2), а не по согласию — значит, отзыв согласия
 * её не прекращает. Удостоверение об охране труда обязано оставаться проверяемым по QR:
 * если стереть из него ФИО, документ перестанет подтверждать обучение конкретного
 * человека, и пострадает не центр, а сам слушатель.
 *
 * Поэтому стираются: карточка слушателя, контакты, СНИЛС, дата рождения, снимки
 * подтверждения личности. Сохраняются: факт обучения, зачисления, результаты и выданные
 * документы. Отчёт об операции честно перечисляет и то, и другое.
 */

/** Что подставляется вместо стёртых полей — заметно и однозначно. */
export const ERASED_PLACEHOLDER = 'Данные удалены по требованию субъекта';

export interface LearnerLike {
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  phone?: string;
  snils?: string;
  dateOfBirth?: string;
  position?: string;
  linkedIamUserId?: string;
}

/**
 * Поля карточки, которые идентифицируют человека и подлежат стиранию.
 *
 * `snilsHash` в памяти не живёт — это слепой индекс, который считается при записи в БД
 * и срезается при чтении (`pii-crypto.ts`). Он всё равно в списке: индекс считается из
 * `snils`, а тот теперь пуст, так что после сохранения индекс не восстановится. Строка
 * оставлена на случай, если хеш когда-нибудь попадёт в состояние — молчаливо уцелевший
 * идентификатор хуже лишней строки.
 */
export const ERASABLE_FIELDS = [
  'firstName',
  'lastName',
  'middleName',
  'email',
  'phone',
  'snils',
  'snilsHash',
  'dateOfBirth'
] as const;

export interface ErasureReport {
  learnerId: string;
  /** Что стёрли — по именам полей, без значений (значения тут были бы утечкой). */
  erasedFields: string[];
  /** Что сохранено по закону и почему. */
  retained: { what: string; reason: string }[];
  identityImagesPurged: number;
}

/**
 * Обезличивание карточки. Возвращает НОВЫЙ объект: мутировать состояние здесь нельзя —
 * решение о записи принимает вызывающий сервис после аудита.
 */
export const eraseLearnerCard = <T extends LearnerLike>(
  learner: T
): { learner: T; erasedFields: string[] } => {
  const erased: string[] = [];
  // Внутри работаем со словарём: часть стираемых ключей (`snilsHash`) в типе карточки
  // отсутствует, и записать `undefined` в необъявленное поле иначе нельзя.
  const next = { ...learner } as Record<string, unknown>;

  for (const field of ERASABLE_FIELDS) {
    if (next[field] !== undefined && next[field] !== null && next[field] !== '') {
      erased.push(field);
    }
    // Поля ФИО обязательны по типу — их заменяем меткой, остальные убираем совсем.
    if (field === 'firstName' || field === 'lastName') {
      next[field] = ERASED_PLACEHOLDER;
    } else {
      next[field] = undefined;
    }
  }

  // Связка с учётной записью снимается: иначе по ней восстанавливается личность.
  if (next.linkedIamUserId) {
    erased.push('linkedIamUserId');
    next.linkedIamUserId = undefined;
  }

  return { learner: next as T, erasedFields: erased };
};

/** Что остаётся после обезличивания и на каком основании. */
export const retentionNotice = (counts: {
  enrollments: number;
  documents: number;
}): ErasureReport['retained'] => [
  {
    what: `зачисления и результаты обучения: ${counts.enrollments}`,
    reason:
      'обработка по обязанности, установленной законом (152-ФЗ ст. 6 ч. 1 п. 2): учебный центр обязан хранить сведения об обучении'
  },
  {
    what: `выданные документы: ${counts.documents}`,
    reason:
      'удостоверения и протоколы — официальные документы; стирание ФИО лишило бы слушателя подтверждения пройденного обучения'
  }
];
