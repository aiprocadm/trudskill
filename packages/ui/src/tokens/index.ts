export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const shadows = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)',
  md: '0 14px 36px -12px rgba(15, 23, 42, 0.20), 0 4px 12px -6px rgba(15, 23, 42, 0.10)',
  lg: '0 28px 64px -20px rgba(8, 15, 30, 0.42)'
} as const;

export const semanticStatusMap = {
  active: 'var(--ui-success-600)',
  inactive: 'var(--ui-neutral-500)',
  archived: 'var(--ui-warning-700)',
  pending: 'var(--ui-warning-600)',
  failed: 'var(--ui-danger-600)',
  running: 'var(--ui-brand-600)',
  queued: 'var(--ui-warning-600)',
  completed: 'var(--ui-success-600)',
  draft: 'var(--ui-neutral-500)',
  published: 'var(--ui-success-600)',
  blocked: 'var(--ui-danger-600)',
  suspended: 'var(--ui-danger-600)',
  cancelled: 'var(--ui-danger-600)'
} as const;

// trudskill — бренд-палитра: индиго (#3B4FE4, структура) + коралл (#FF7A45, действие).
// Нейтрали — холодная slate-шкала, почти чёрный текст. Все цвета проверены на WCAG AA
// как текст на белом (≥4.5:1). Герой — индиго-градиент с коралловой CTA (тёмный текст).
export const lightThemeVars = {
  '--ui-bg': '#f8fafc',
  '--ui-surface': '#ffffff',
  '--ui-surface-muted': '#f1f5f9',
  '--ui-surface-accent': '#eef1fe',
  '--ui-border': '#e2e8f0',
  '--ui-text': '#0f172a',
  '--ui-text-muted': '#475569',
  '--ui-neutral-50': '#f8fafc',
  '--ui-neutral-100': '#f1f5f9',
  '--ui-neutral-300': '#cbd5e1',
  '--ui-neutral-700': '#334155',
  '--ui-neutral-900': '#0f172a',
  '--ui-brand-600': '#3b4fe4',
  '--ui-brand-700': '#2c3ac0',
  // Акцент = коралл (главные кнопки/прогресс). С белым текстом коралл проваливает AA (2.6:1),
  // поэтому коралловые кнопки используют тёмный текст --ui-text (6.4:1).
  '--ui-accent-600': '#ff7a45',
  '--ui-accent-700': '#ea6326',
  // Текст на коралле — всегда тёмный (в обеих темах коралл светлый). Белый текст = провал AA.
  '--ui-on-accent': '#0f172a',
  '--ui-info-600': '#0b6aa6',
  // success/warning затемнены до AA-уровня как текст на белом (яркие #16A34A/#F59E0B давали 3.2:1).
  '--ui-success-600': '#15803d',
  '--ui-warning-600': '#b45309',
  '--ui-warning-700': '#92400e',
  '--ui-danger-600': '#dc2626',
  '--ui-neutral-500': '#64748b',
  '--ui-focus': '#3b4fe4',
  '--ui-shadow': shadows.sm,
  '--ui-shadow-strong': shadows.md,
  // Боковая навигация — глубокий индиго «рейка», белый активный пункт (высокий контраст)
  '--ui-nav-sidebar-bg': '#1e2150',
  '--ui-nav-hover-bg': '#2c2f6b',
  '--ui-nav-active-bg': 'rgba(255, 255, 255, 0.13)',
  '--ui-nav-active-text': '#ffffff',
  '--ui-nav-text': '#e9ecfb',
  '--ui-nav-text-muted': '#a9afd6',
  '--ui-error-border': '#fecaca',
  // Герой «Следующий шаг» — индиго-градиент с коралловой CTA (тёмный текст для AA)
  '--ui-hero-bg': 'linear-gradient(135deg, #2c3ac0 0%, #3b4fe4 55%, #5b6cf0 100%)',
  '--ui-hero-text': '#f7f9ff',
  '--ui-hero-muted': '#d4dafb',
  '--ui-hero-eyebrow': '#c2ccfa',
  '--ui-hero-cta-bg': '#ff7a45',
  '--ui-hero-cta-bg-hover': '#ea6326',
  '--ui-hero-cta-text': '#0f172a',
  '--ui-hero-seal': 'rgba(255, 255, 255, 0.10)'
} as const;

// Тёмная тема — те же роли, осветлённые версии бренда/акцента для контраста на тёмном фоне.
export const darkThemeVars = {
  '--ui-bg': '#0b1120',
  '--ui-surface': '#151b2e',
  '--ui-surface-muted': '#1c2438',
  '--ui-surface-accent': '#222c46',
  '--ui-border': '#2a3550',
  '--ui-text': '#f1f5f9',
  '--ui-text-muted': '#aeb9cd',
  '--ui-neutral-50': '#f6f8fb',
  '--ui-neutral-100': '#e6ebf2',
  '--ui-neutral-300': '#9aa6ba',
  '--ui-neutral-700': '#46536b',
  '--ui-neutral-900': '#0b1120',
  '--ui-brand-600': '#6b7bf0',
  '--ui-brand-700': '#a9b5f8',
  '--ui-accent-600': '#ff8a5c',
  '--ui-accent-700': '#ff9e78',
  '--ui-on-accent': '#1a1205',
  '--ui-info-600': '#3aa6e0',
  '--ui-success-600': '#34d27a',
  '--ui-warning-600': '#f0a93a',
  '--ui-warning-700': '#d9942e',
  '--ui-danger-600': '#f0795f',
  '--ui-neutral-500': '#aab6cb',
  '--ui-focus': '#6b7bf0',
  '--ui-shadow': '0 1px 2px rgba(0, 0, 0, 0.34)',
  '--ui-shadow-strong': '0 18px 44px -16px rgba(0, 0, 0, 0.64)',
  '--ui-nav-sidebar-bg': '#0a0e1c',
  '--ui-nav-hover-bg': '#1a2238',
  '--ui-nav-active-bg': 'rgba(255, 255, 255, 0.14)',
  '--ui-nav-active-text': '#ffffff',
  '--ui-nav-text': '#e9ecfb',
  '--ui-nav-text-muted': '#9fa8cf',
  '--ui-error-border': '#7f2418',
  '--ui-hero-bg': 'linear-gradient(135deg, #1b2270 0%, #2c3ac0 100%)',
  '--ui-hero-text': '#f4f6ff',
  '--ui-hero-muted': '#c6cdf2',
  '--ui-hero-eyebrow': '#aeb9f5',
  '--ui-hero-cta-bg': '#ff8a5c',
  '--ui-hero-cta-bg-hover': '#ff9e78',
  '--ui-hero-cta-text': '#1a1205',
  '--ui-hero-seal': 'rgba(255, 255, 255, 0.08)'
} as const;

// CSS-мост: базовые (не зависящие от темы) переменные — отступы, радиусы, типографика.
// Значения синхронизированы с JS-токенами spacing/radius (гарантируется base-vars.test.ts).
// Вёрстка в styles/* должна ссылаться на эти var(--ui-*), а не хардкодить px.
export const baseVars = {
  '--ui-space-xs': `${spacing.xs}px`,
  '--ui-space-sm': `${spacing.sm}px`,
  '--ui-space-md': `${spacing.md}px`,
  '--ui-space-lg': `${spacing.lg}px`,
  '--ui-space-xl': `${spacing.xl}px`,
  '--ui-space-xxl': `${spacing.xxl}px`,
  '--ui-radius-sm': `${radius.sm}px`,
  '--ui-radius-md': `${radius.md}px`,
  '--ui-radius-lg': `${radius.lg}px`,
  '--ui-radius-pill': `${radius.pill}px`,
  '--ui-font-size-xs': '12px',
  '--ui-font-size-sm': '13px',
  '--ui-font-size-md': '15px',
  '--ui-font-size-lg': '17px',
  '--ui-font-size-xl': '22px',
  '--ui-font-weight-medium': '500',
  '--ui-font-weight-semibold': '600',
  '--ui-font-weight-bold': '700',
  '--ui-line-height-tight': '1.2',
  '--ui-line-height-normal': '1.5'
} as const;
