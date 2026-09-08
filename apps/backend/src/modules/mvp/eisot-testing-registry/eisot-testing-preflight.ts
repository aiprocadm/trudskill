import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { EisotTestingRow, EisotTestingRowError } from '../mvp.types.js';

const INN_RE = /^(\d{10}|\d{12})$/;
const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;

/**
 * Проверка строки ЕИСОТ «лица на тестирование» перед выгрузкой. Незаполненное поле — отказ
 * СТРОКИ, а не всего файла: остальные уходят, по отчёту видно поимённо, кого дозаполнить.
 *
 * СНИЛС стал обязательным в Фазе 3 (ФТ-C4.1), дата рождения — 08.09.2026 по решению
 * владельца (вопрос №12). Необязательными остались ИНН работодателя, должность и программа.
 */
export function validateEisotTestingRow(row: EisotTestingRow): EisotTestingRowError[] {
  const errs: EisotTestingRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      enrollmentId: row.enrollmentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.fullName?.trim() || !row.lastName?.trim() || !row.firstName?.trim())
    push('fullName', 'ФИО отсутствует (нужны фамилия и имя)');
  if (!row.employerName?.trim()) push('employerName', 'Наименование работодателя отсутствует');

  // СНИЛС опционален; но если указан — должен быть валиден (ловим опечатки ввода).
  // ФТ-C4.1 (Фаза 3 Task 8): СНИЛС обязателен. Раньше пустой СНИЛС давал пустую ячейку —
  // файл уходил в реестр, а человек в нём фактически не опознавался. Отсутствие поля
  // должно быть видно ДО отправки, а не приходить ошибкой реестра через недели.
  if (!row.snils?.trim()) {
    push('snils', 'СНИЛС не заполнен — без него запись в реестре не принимается');
  } else {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils))
      push('snils', 'СНИЛС не проходит проверку контрольной суммы — вероятна опечатка');
  }
  // ИНН опционален; но если указан — 10 или 12 цифр.
  if (row.employerInn?.trim() && !INN_RE.test(row.employerInn.trim()))
    push('employerInn', 'ИНН работодателя должен содержать 10 или 12 цифр');

  /*
   * Вопрос №12 «Арендной СДО», решение 08.09.2026: дата рождения ОБЯЗАТЕЛЬНА для выгрузки,
   * но НЕ для заведения слушателя. Требовать её при заведении значило бы стопорить
   * ежедневную работу центра ради того, что бывает раз в квартал; а пустая ячейка в файле
   * означала, что запись подадут и она вернётся отказом реестра через недели — когда
   * искать, у кого чего не хватает, будет уже некогда.
   *
   * По дате рождения в реестре различают однофамильцев: «Иванов Иван Иванович» без неё —
   * это не человек, а совпадение букв.
   */
  if (!row.dateOfBirth?.trim()) {
    push(
      'dateOfBirth',
      'Дата рождения не заполнена — заполните её в карточке слушателя, без неё запись в реестре не принимается'
    );
  } else if (!DATE_RE.test(row.dateOfBirth)) {
    push('dateOfBirth', 'Дата рождения должна быть в формате ДД.ММ.ГГГГ');
  }

  return errs;
}
