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

/** Инлайн-переменные обёртки. Пустой объект = бренда нет, обёртка не нужна. */
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
  }
  return vars;
};

/** Название в шапке: бренд → нейтральный wordmark платформы. */
export const resolveWordmark = (branding: TenantBrandingDto | null | undefined): string => {
  const name = branding?.displayName?.trim();
  return name && name.length > 0 ? name : 'trudskill';
};
