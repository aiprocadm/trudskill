/**
 * Разбор русского ФИО — **один на весь модуль**.
 *
 * Почему отдельным файлом. Разбор жил внутри `learners-bulk-import.service.ts`, а
 * `MvpService` его импортировать не мог: сервис импорта сам зависит от `MvpService`, и
 * получилась бы циклическая зависимость. Из-за этого ручной путь ввода («создать
 * слушателя») много месяцев жил со своим наивным `name.split(' ')`, который принимал
 * «Иванов Иван Иванович» за имя «Иванов» и фамилию «Иван», а отчество терял (срез 44).
 *
 * Одинаковый разбор на оба пути — обязательное условие: один и тот же человек, заведённый
 * руками и загруженный Excel-файлом, должен получить одну и ту же карточку. ФИО отсюда
 * попадает в удостоверение и протокол, то есть в документ с юридической силой.
 */

export interface ParsedFullName {
  firstName: string;
  lastName: string;
  middleName?: string;
}

/**
 * «Фамилия Имя [Отчество]» → части. Для коротких записей возвращаются безопасные
 * значения: одно слово считается именем (фамилия неизвестна), два — «Фамилия Имя».
 */
export function parseFullName(fullName: string): ParsedFullName {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { lastName: '', firstName: parts[0]! };
  if (parts.length === 2) return { lastName: parts[0]!, firstName: parts[1]! };
  const [lastName, firstName, ...middleParts] = parts;
  return {
    lastName: lastName!,
    firstName: firstName!,
    middleName: middleParts.join(' ')
  };
}
