/** Класс для визуально-скрытого, но доступного скринридеру текста (label-ассоциация). */
export const VISUALLY_HIDDEN_CLASS = 'ui-visually-hidden';

/** Детерминированный id для связки label↔input/hint/error. */
export function fieldId(base: string, suffix: 'label' | 'input' | 'hint' | 'error'): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'field';
  return `${slug}-${suffix}`;
}
