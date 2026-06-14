/** Класс для визуально-скрытого, но доступного скринридеру текста (label-ассоциация). */
export const VISUALLY_HIDDEN_CLASS = 'ui-visually-hidden';

/**
 * Детерминированный id для связки label↔input/hint/error.
 *
 * Сохраняет буквы ЛЮБОГО алфавита (кириллица включительно) через Unicode-классы
 * `\p{L}\p{N}` — продукт русскоязычный, и сужение до `[a-z0-9]` схлопывало все
 * кириллические подписи в один slug `field`, плодя дубликаты id на формах/фильтрах.
 * id с кириллицей валиден в HTML5; ассоциации `htmlFor`/`aria-describedby` матчатся
 * по строковому равенству, не через CSS-селекторы, поэтому экранирование не требуется.
 */
export function fieldId(base: string, suffix: 'label' | 'input' | 'hint' | 'error'): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'field';
  return `${slug}-${suffix}`;
}
