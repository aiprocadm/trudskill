import { hasPermission } from './permissions';

/**
 * Ссылки на разделы, доступные человеку по правам (ТЗ 6.1 / С1).
 *
 * Зачем отдельной функцией. Ссылка на раздел, куда человека не пустят, — это тупик, а не
 * навигация (правило Э2): он жмёт и получает отказ. Отбор нужен в двух местах сразу —
 * на главной кабинета слушателя и в его профиле, — и в обоих он должен работать одинаково.
 *
 * Чистая функция, а не проверка внутри разметки: её значения проверяются тестом. Сторож,
 * который ищет в файле слово `hasPermission`, доволен одной строкой импорта — на этом уже
 * обжигались (журнал 464).
 */
export interface PermissionLink {
  href: string;
  label: string;
  hint: string;
  /** Право, без которого раздел человеку не откроется. */
  permission: string;
}

export const linksForPermissions = <T extends PermissionLink>(
  links: readonly T[],
  permissions: readonly string[]
): T[] => links.filter((link) => hasPermission([...permissions], [link.permission]));
