/**
 * ФТ-D3.1 (Фаза 4 Task 4): тема тенанта ПОВЕРХ токенов ui.
 *
 * CSS-переменные наследуются, поэтому обёртка с теми же именами переменных
 * перекрывает значения UiThemeProvider для своего поддерева — сам пакет ui
 * ничего не знает про арендаторов и остаётся бренд-нейтральным.
 *
 * Мусорные значения (правленый вручную payload, старые данные) молча
 * отбрасываются — вёрстка падает к теме по умолчанию, а не ломается.
 */

import { readableTextOn } from '@trudskill/ui';

export interface TenantBrandingDto {
  displayName?: string;
  logoUrl?: string;
  brandColor?: string;
  accentColor?: string;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_PATTERN.test(value);

/**
 * Ховер-оттенок (-700) считается из основного затемнением: просить у админа
 * второй цвет «для наведения» — лишний вопрос, на который он ответит наугад.
 */
export const darkenHexColor = (hex: string, factor = 0.18): string => {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16);
    return Math.max(0, Math.round(value * (1 - factor)));
  });
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Инлайн-переменные обёртки. Пустой объект = бренда нет, обёртка не нужна.
 *
 * `UI-005` — почему здесь считается ещё и цвет текста. Токен `--ui-on-accent` задан тёмным
 * (`#0f172a`) исходя из того, что акцент — светлый коралл. Для коралла это верно (6.4:1
 * против 2.6:1 у белого), а для ПРОИЗВОЛЬНОГО цвета арендатора — нет: центр с тёмно-синим
 * фирменным цветом получал тёмный текст на тёмной кнопке и не мог прочитать собственную
 * первичную кнопку. Теперь цвет текста выбирается по измеренному контрасту.
 *
 * `UI-006` — почему `--ui-nav-*` здесь НЕТ и появиться не должно. Боковое меню остаётся
 * тёмной поверхностью с гарантированным контрастом: произвольный цвет там непредсказуем
 * (светло-жёлтый фирменный цвет сделал бы меню нечитаемым, а подобрать текст под него
 * автоматически недостаточно — там ещё состояния наведения и выбранного пункта). Фирменный
 * цвет арендатора виден в логотипе, активном пункте и первичных кнопках. Это решение, а не
 * недоделка: не «дочинивайте» его в следующий заход.
 */
export const brandingToThemeVars = (
  branding: TenantBrandingDto | null | undefined
): Record<string, string> => {
  const vars: Record<string, string> = {};
  if (branding && isHexColor(branding.brandColor)) {
    const brand = branding.brandColor.toLowerCase();
    vars['--ui-brand-600'] = brand;
    vars['--ui-brand-700'] = darkenHexColor(brand);
    // Приглушённая заливка «фирменных» поверхностей: 12% цвета поверх прозрачного.
    vars['--ui-surface-accent'] = `color-mix(in srgb, ${brand} 12%, transparent)`;
  }
  if (branding && isHexColor(branding.accentColor)) {
    const accent = branding.accentColor.toLowerCase();
    vars['--ui-accent-600'] = accent;
    vars['--ui-accent-700'] = darkenHexColor(accent);
    /*
     * Текст на кнопке считается по акценту, а не по бренду: кнопка красится в `--ui-accent-*`.
     * Наведение (`-700`) — затемнение того же цвета, поэтому подходящий текст у них общий:
     * затемнение не может перевернуть выбор со светлого на тёмный.
     */
    vars['--ui-on-accent'] = readableTextOn(accent);
    vars['--ui-hero-cta-bg'] = accent;
    vars['--ui-hero-cta-bg-hover'] = darkenHexColor(accent);
    vars['--ui-hero-cta-text'] = readableTextOn(accent);
  }
  return vars;
};

/** Название в шапке: бренд → нейтральный wordmark платформы. */
export const resolveWordmark = (branding: TenantBrandingDto | null | undefined): string => {
  const name = branding?.displayName?.trim();
  return name && name.length > 0 ? name : 'trudskill';
};
