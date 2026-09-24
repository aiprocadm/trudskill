/**
 * Маскирование персональных данных в списках (ТЗ «Стабилизация, UX и развитие», 17.2).
 *
 * **Что было.** Список слушателей отдавал СНИЛС ПОЛНОСТЬЮ — всем, у кого есть право видеть
 * список. А список открыт менеджеру, который ведёт клиентов, и преподавателю, который ведёт
 * группу. Им нужно узнать человека в строке, а не его номер в пенсионном фонде.
 *
 * Разница принципиальная. Полный СНИЛС на экране — это данные, которые можно переписать,
 * сфотографировать, выгрузить в таблицу и унести. Причём незаметно: никакого следа в системе
 * такой просмотр не оставлял, и на проверке ответить «кто видел эти данные» было нечем
 * (журнал 577).
 *
 * **Что стало.** В списках номер показан частично — последние две цифры, чтобы отличать
 * записи друг от друга. Полностью он виден по ЯВНОМУ действию человека, и это действие
 * пишется в журнал доступа.
 *
 * **Почему именно последние две цифры.** Сотруднику в списке нужно одно: не перепутать двух
 * Ивановых. Для этого хватает двух цифр, а восстановить по ним номер нельзя.
 */

/** Что именно скрывается. Список закрыт: новое поле не должно просочиться незамеченным. */
export type MaskedField = 'snils' | 'passport' | 'birthDate';

/**
 * Частично показанный СНИЛС.
 *
 * Пусто превращается в прочерк, а не в пустую ячейку: пустая ячейка выглядит как сбой
 * загрузки, и человек нажимает «обновить», хотя данных просто нет.
 */
export const maskedSnils = (value: string | undefined | null): string => {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-*** ${digits.slice(-2)}`;
};

/**
 * Частично показанный паспорт.
 *
 * Серия скрыта целиком, от номера остаются последние три цифры. Серия сама по себе почти не
 * различает людей (она общая для целого региона и года), а вот вместе с номером это уже
 * готовый документ.
 */
export const maskedPassport = (value: string | undefined | null): string => {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `**** ***${digits.slice(-3)}`;
};

/**
 * Частично показанная дата рождения.
 *
 * Остаётся только год. День и месяц — это то, что спрашивают при подтверждении личности по
 * телефону, и в списке они не нужны никому.
 */
export const maskedBirthDate = (value: string | undefined | null): string => {
  if (!value) return '—';
  const year = /(\d{4})/.exec(value)?.[1];
  return year ? `**.**.${year}` : '***';
};

/** Право, которое даёт видеть персональные данные полностью. */
export const PII_REVEAL_PERMISSION = 'learners.pii.manage';

/**
 * Можно ли этому человеку раскрыть данные целиком.
 *
 * Права берутся из разрешённого множества запроса, а не из названия роли: набор прав роли
 * живёт в базе и не совпадает с тем, что подсказывает название (на этом в проекте уже
 * обжигались дважды за одну сессию).
 */
export const canRevealPii = (permissions: readonly string[] | undefined): boolean =>
  (permissions ?? []).includes(PII_REVEAL_PERMISSION);

/**
 * Что записать в журнал доступа.
 *
 * Отдельная функция, а не строка в контроллере: запись нужна одинаковая из всех мест, где
 * данные раскрываются, — карточка, выгрузка, скачивание файла. Разные формулировки из разных
 * мест превратили бы журнал в то, по чему нельзя искать.
 */
export interface PiiAccessRecord {
  action: 'pii.revealed' | 'pii.exported' | 'pii.file_downloaded';
  /** Чьи данные смотрели. */
  learnerId: string;
  /** Какие именно поля раскрыты — чтобы на проверке отвечать точно, а не «что-то смотрели». */
  fields: MaskedField[];
  /** Зачем: человек называет причину сам, и она попадает в журнал. */
  reason?: string;
}

export const piiAccessMetadata = (record: PiiAccessRecord): Record<string, unknown> => ({
  learnerId: record.learnerId,
  fields: record.fields,
  ...(record.reason ? { reason: record.reason } : {})
});

/**
 * Скрыть персональные поля в записи списка.
 *
 * Работает по КОПИИ и возвращает новый объект: изменить исходную запись значило бы испортить
 * данные в памяти для всех остальных — в этом модуле состояние арендатора живёт в общей
 * структуре, и одна такая правка утекла бы в соседний запрос.
 */
/** Паспорт бывает объектом (МГ-C1.1) или строкой (старые записи) — маска одна. */
const passportDigits = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const p = value as { series?: string; number?: string };
  return `${p.series ?? ''} ${p.number ?? ''}`.trim() || null;
};

/*
 * Маскируются оба написания даты рождения: `dateOfBirth` — поле карточки, `birthDate` —
 * старое имя в ответах раскрытия. Раньше маска знала только `birthDate`, и дата рождения
 * уходила в список открытой (журнал 637, срез 8.12).
 */
export const maskLearnerRow = <
  T extends {
    snils?: string | null;
    passport?: unknown;
    birthDate?: string | null;
    dateOfBirth?: string | null;
  }
>(
  row: T
): T =>
  ({
    ...row,
    ...(row.snils !== undefined ? { snils: maskedSnils(row.snils) } : {}),
    ...(row.passport !== undefined
      ? { passport: maskedPassport(passportDigits(row.passport)) }
      : {}),
    ...(row.birthDate !== undefined ? { birthDate: maskedBirthDate(row.birthDate) } : {}),
    ...(row.dateOfBirth !== undefined ? { dateOfBirth: maskedBirthDate(row.dateOfBirth) } : {})
  }) as T;
