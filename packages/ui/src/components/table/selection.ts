export type RowKey = string | number;

/** Состояние чекбокса в шапке: ничего / часть / вся текущая страница. */
export type SelectionState = 'none' | 'some' | 'all';

/**
 * Логика выделения строк реестра (CMP-001) вынесена из компонента: в пакете нет RTL,
 * и проверить поведение можно только на чистых функциях.
 *
 * Выделение хранится ключами и переживает смену страницы — поэтому «выделить все»
 * работает с ключами ТЕКУЩЕЙ страницы, не затрагивая выбранное на других.
 */
export const toggleKey = (selected: readonly RowKey[], key: RowKey): RowKey[] =>
  selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];

export const toggleAll = (selected: readonly RowKey[], pageKeys: readonly RowKey[]): RowKey[] => {
  const allSelected = pageKeys.length > 0 && pageKeys.every((key) => selected.includes(key));
  if (allSelected) return selected.filter((key) => !pageKeys.includes(key));
  const missing = pageKeys.filter((key) => !selected.includes(key));
  return [...selected, ...missing];
};

export const selectionState = (
  selected: readonly RowKey[],
  pageKeys: readonly RowKey[]
): SelectionState => {
  if (pageKeys.length === 0) return 'none';
  const selectedOnPage = pageKeys.filter((key) => selected.includes(key)).length;
  if (selectedOnPage === 0) return 'none';
  return selectedOnPage === pageKeys.length ? 'all' : 'some';
};
