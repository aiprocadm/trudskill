/**
 * Допустимые значения настроек центра (журнал 303).
 *
 * Раньше проверялась только ФОРМА: `Matches(/^[A-Za-z]+\/[A-Za-z_+-]+$/)` пропускал
 * `Europe/Atlantis`. Пока часовой пояс ни на что не влиял, это было безобидно. С тех пор как
 * по нему считаются дата удостоверения и сроки (журнал 300/301), несуществующий пояс стал
 * дефектом: центр сохранял опечатку, расчёт молча падал на пояс по умолчанию, и человек
 * никогда не узнавал, почему даты «не те».
 *
 * Проверять надо по НАСТОЯЩЕМУ списку зон, а не по узору.
 */

/** Есть ли такая зона на самом деле. */
export function isRealTimeZone(value: string): boolean {
  const zone = value.trim();
  if (!zone) return false;
  try {
    // Единственная честная проверка: попросить платформу отформатировать дату в этой зоне.
    new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Языки, которые продукт умеет на самом деле. Экран реквизитов предлагал свободный ввод
 * «Язык интерфейса», но перевода нет ни одного: значение сохранялось и не влияло ни на что.
 * Пока перевода нет, поле обязано предлагать ровно то, что есть (ТЗ §5 — требование
 * поддерживать настройку языка остаётся невыполненным, см. журнал 304).
 */
export const SUPPORTED_LOCALES = ['ru-RU'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): boolean {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value.trim());
}
