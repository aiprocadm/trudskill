/**
 * Расчёт контраста по WCAG 2.2 — одна реализация на весь проект.
 *
 * Зачем в коде, а не «померили один раз и записали в комментарий»: числа в комментариях
 * устаревают молча. Значение цвета правят, комментарий остаётся прежним, и «проверено на AA»
 * превращается в «когда-то было проверено». Функция ниже позволяет измерять токены прогоном
 * теста, а `brandingToThemeVars` — выбирать читаемый текст для цвета арендатора.
 */

/** Пороги WCAG 2.2 AA. */
export const AA_NORMAL_TEXT = 4.5;
/** Крупный текст (≥18.66px жирный или ≥24px обычный), значки и границы элементов управления. */
export const AA_LARGE_TEXT = 3;

/** `#rrggbb` → [r, g, b] в диапазоне 0…255. Регистр не важен. */
export const parseHexColor = (hex: string): [number, number, number] | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1] as string;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
};

/**
 * Относительная яркость по WCAG 2.2 (§ relative luminance).
 *
 * Обратите внимание на нелинейность: канал сначала переводится в долю 0…1, затем к нему
 * применяется гамма-коррекция. Простое «сложить r+g+b» даёт другой ответ и подводит именно
 * на средних тонах — там, где выбор «тёмный или светлый текст» и решается.
 */
export const relativeLuminance = (hex: string): number | null => {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Коэффициент контраста двух цветов: от 1 (неразличимы) до 21 (чёрный на белом). */
export const contrastRatio = (foreground: string, background: string): number | null => {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  if (first === null || second === null) return null;
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

/** Тёмный текст поверх фирменных поверхностей — тот же, что у токена `--ui-text`. */
export const DARK_TEXT = '#0f172a';
export const LIGHT_TEXT = '#ffffff';

/**
 * Какой текст читается на этом фоне (`UI-005`).
 *
 * Выбирается не по «светлый ли цвет на глаз», а по измеренному контрасту: берётся тот из
 * двух вариантов, который даёт больший коэффициент. Для коралла `#ff7a45` это тёмный текст
 * (6.4:1 против 2.6:1 у белого) — то же решение, что зафиксировано в токенах вручную,
 * но теперь оно верно и для произвольного цвета арендатора.
 */
export const readableTextOn = (background: string): string => {
  const onDark = contrastRatio(DARK_TEXT, background);
  const onLight = contrastRatio(LIGHT_TEXT, background);
  if (onDark === null || onLight === null) return DARK_TEXT;
  return onDark >= onLight ? DARK_TEXT : LIGHT_TEXT;
};
