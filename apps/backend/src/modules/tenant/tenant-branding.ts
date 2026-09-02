/**
 * ФТ-D3.1 (Фаза 4 Task 4): бренд учебного центра — white-label поверх токенов ui.
 *
 * Хранится в `org.tenant_settings.payload.branding` (как identity-settings живут
 * в requisites.payload). Чтение НАМЕРЕННО терпимо к мусору: payload правится и
 * сырым `PUT /tenant/settings`, и старыми данными — кривое значение просто
 * отбрасывается, и поле падает к теме по умолчанию (требование плана: мусор не
 * ломает вёрстку). Запись через `PUT /tenant/branding` — строгая: админ, вводящий
 * «#зелёненький», должен получить ошибку, а не молча дефолт.
 */

export const TENANT_BRANDING_KEY = 'branding';

export interface TenantBranding {
  /** Название центра в шапке, письмах и на публичной проверке. */
  displayName?: string;
  /** Абсолютный http(s)-адрес логотипа (файл хостит сам центр или платформа). */
  logoUrl?: string;
  /** Основной цвет (#rrggbb) — структура интерфейса. */
  brandColor?: string;
  /** Акцентный цвет (#rrggbb) — главные кнопки и действия. */
  accentColor?: string;
}

export const MAX_BRANDING_NAME_LENGTH = 120;
export const MAX_BRANDING_LOGO_URL_LENGTH = 500;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const isValidBrandingColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_PATTERN.test(value);

export const isValidBrandingLogoUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > MAX_BRANDING_LOGO_URL_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    // Не разбирается как адрес — значит логотип задан неверно: ответ проверки, а не сбой.
    return false;
  }
};

export const isValidBrandingDisplayName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= MAX_BRANDING_NAME_LENGTH;

/** Терпимое чтение: каждое кривое поле отбрасывается независимо от остальных. */
export const readTenantBranding = (
  settings: { payload?: Record<string, unknown> } | null | undefined
): TenantBranding => {
  const raw = settings?.payload?.[TENANT_BRANDING_KEY];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const branding: TenantBranding = {};
  if (isValidBrandingDisplayName(source.displayName)) {
    branding.displayName = source.displayName.trim();
  }
  if (isValidBrandingLogoUrl(source.logoUrl)) {
    branding.logoUrl = source.logoUrl;
  }
  if (isValidBrandingColor(source.brandColor)) {
    branding.brandColor = source.brandColor.toLowerCase();
  }
  if (isValidBrandingColor(source.accentColor)) {
    branding.accentColor = source.accentColor.toLowerCase();
  }
  return branding;
};

export interface BrandingValidationIssue {
  field: keyof TenantBranding;
  code:
    | 'invalid_display_name'
    | 'invalid_logo_url'
    | 'invalid_brand_color'
    | 'invalid_accent_color';
}

/**
 * Строгая проверка входа PUT. Пустая строка = «сбросить поле к дефолту» —
 * иначе админ не смог бы убрать однажды заданный логотип.
 */
export const validateBrandingInput = (
  body: Record<string, unknown>
): { branding: Record<string, string | undefined>; issues: BrandingValidationIssue[] } => {
  const issues: BrandingValidationIssue[] = [];
  const branding: Record<string, string | undefined> = {};

  const takeField = (
    field: keyof TenantBranding,
    isValid: (value: unknown) => boolean,
    code: BrandingValidationIssue['code'],
    normalize: (value: string) => string
  ) => {
    const value = body[field];
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') {
      branding[field] = undefined;
      return;
    }
    if (isValid(value)) {
      branding[field] = normalize(value as string);
      return;
    }
    issues.push({ field, code });
  };

  takeField('displayName', isValidBrandingDisplayName, 'invalid_display_name', (v) => v.trim());
  takeField('logoUrl', isValidBrandingLogoUrl, 'invalid_logo_url', (v) => v);
  takeField('brandColor', isValidBrandingColor, 'invalid_brand_color', (v) => v.toLowerCase());
  takeField('accentColor', isValidBrandingColor, 'invalid_accent_color', (v) => v.toLowerCase());

  return { branding, issues };
};

/** Имя центра для писем и публичной проверки: бренд → название тенанта → нейтральное. */
export const resolveTenantDisplayName = (
  branding: TenantBranding,
  tenantName?: string | null
): string => branding.displayName ?? (tenantName?.trim() || 'учебный центр');
