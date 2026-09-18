/**
 * Пороги напоминаний — настройка центра, а не число в коде
 * (ТЗ «Стабилизация, UX и развитие», 11.3, решение владельца Р11).
 *
 * **Правило репозитория:** всё, что выглядит как срок, порог или лимит, реализуется настройкой
 * со значением по умолчанию. Здесь это особенно важно: за сколько дней предупреждать — вопрос не
 * технический, а организационный. Шестьдесят дней до переаттестации выбраны не случайно: это
 * срок, за который предприятие успевает согласовать бюджет и отправить людей. Центру, который
 * работает иначе, нужно уметь поменять это, не трогая код.
 *
 * **Настройка человека может прийти испорченной** — строкой вместо числа, нулём, пустым списком,
 * отрицательным значением. Поэтому разбор отдельной чистой функцией: непригодная настройка не
 * ломает напоминания и не отключает их молча, а откатывается к умолчанию.
 */

export type ReminderKind =
  | 'courseDeadline'
  | 'recertification'
  | 'licenseExpiry'
  | 'knowledgeRetest';

/**
 * Умолчания решения Р11, по возрастанию (дней до события).
 *
 * `courseDeadline` — 14, 3 и 1 день; `recertification` — 60, 30 и 7.
 * `licenseExpiry` намеренно шире (90): отозванная лицензия центра останавливает выдачу
 * документов вообще, а её продление занимает месяцы — сузить это окно значило бы молча
 * ухудшить предупреждение о самом дорогом сбое.
 * `knowledgeRetest` — 14, 7 и 3 дня до истечения 30-дневного срока повторной проверки (10.4).
 */
export const REMINDER_DEFAULTS: Record<ReminderKind, readonly number[]> = {
  courseDeadline: [1, 3, 14],
  recertification: [7, 30, 60],
  licenseExpiry: [7, 30, 90],
  knowledgeRetest: [3, 7, 14]
};

/** Ключ в свободном наборе настроек центра (`org.tenant_settings.payload`). */
export const REMINDER_SETTINGS_KEY = 'reminderMilestones';

/** Больше четырёх напоминаний об одном событии — это уже навязчивость, а не забота. */
const MAX_MILESTONES = 4;
/** Год вперёд: всё, что дальше, человек забудет к сроку. */
const MAX_DAYS = 365;

/**
 * Пороги для одного вида напоминаний: из настроек центра, иначе умолчание Р11.
 *
 * Возвращает список по возрастанию без повторов. Любое непригодное значение отбрасывается;
 * если после отбраковки не осталось ничего — берётся умолчание, потому что «настройка
 * испорчена» не повод перестать предупреждать людей о сроках.
 */
export const reminderMilestones = (
  kind: ReminderKind,
  payload: Record<string, unknown> | undefined
): readonly number[] => {
  const fallback = REMINDER_DEFAULTS[kind];
  const raw = (payload?.[REMINDER_SETTINGS_KEY] as Record<string, unknown> | undefined)?.[kind];
  if (!Array.isArray(raw)) return fallback;

  const clean = [
    ...new Set(
      raw.filter(
        (value): value is number =>
          typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_DAYS
      )
    )
  ]
    .sort((a, b) => a - b)
    .slice(0, MAX_MILESTONES);

  return clean.length > 0 ? clean : fallback;
};
