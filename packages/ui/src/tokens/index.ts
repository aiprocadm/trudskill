export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
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

// Читаемость в приоритете: холодные чистые нейтрали, почти чёрный текст, контрастный синий.
// Тёмно-синий герой с белой кнопкой (макс. контраст). См.
// docs/superpowers/specs/2026-06-06-cdoprof-visual-design-system.md
export const lightThemeVars = {
  '--ui-bg': '#e9edf3',
  '--ui-surface': '#ffffff',
  '--ui-surface-muted': '#f2f5f9',
  '--ui-surface-accent': '#e6edfb',
  '--ui-border': '#d3d9e4',
  '--ui-text': '#0f1626',
  '--ui-text-muted': '#475063',
  '--ui-neutral-50': '#f6f8fb',
  '--ui-neutral-100': '#eef1f6',
  '--ui-neutral-300': '#c2c9d6',
  '--ui-neutral-700': '#384256',
  '--ui-neutral-900': '#0f1626',
  '--ui-brand-600': '#1e40af',
  '--ui-brand-700': '#16317f',
  '--ui-accent-600': '#1e40af',
  '--ui-info-600': '#0b6aa6',
  '--ui-success-600': '#1d7a40',
  '--ui-warning-600': '#a8530a',
  '--ui-warning-700': '#8a4408',
  '--ui-danger-600': '#bf2e1a',
  '--ui-neutral-500': '#5e6675',
  '--ui-focus': '#2563eb',
  '--ui-shadow': shadows.sm,
  '--ui-shadow-strong': shadows.md,
  // Боковая навигация — тёмно-синяя «рейка», белый активный пункт (высокий контраст)
  '--ui-nav-sidebar-bg': '#16294d',
  '--ui-nav-hover-bg': '#22426f',
  '--ui-nav-active-bg': 'rgba(255, 255, 255, 0.13)',
  '--ui-nav-active-text': '#ffffff',
  '--ui-nav-text': '#e9eff9',
  '--ui-nav-text-muted': '#a7b6d2',
  '--ui-error-border': '#f0c0b4',
  // Герой «Следующий шаг» — тёмно-синий с белой кнопкой
  '--ui-hero-bg': 'linear-gradient(135deg, #16294d 0%, #1f3f72 55%, #285596 100%)',
  '--ui-hero-text': '#f7f9fc',
  '--ui-hero-muted': '#cdd9ee',
  '--ui-hero-eyebrow': '#a9c2f0',
  '--ui-hero-cta-bg': '#ffffff',
  '--ui-hero-cta-bg-hover': '#e9f0fb',
  '--ui-hero-cta-text': '#16294d',
  '--ui-hero-seal': 'rgba(255, 255, 255, 0.10)'
} as const;

export const darkThemeVars = {
  '--ui-bg': '#0d1626',
  '--ui-surface': '#162234',
  '--ui-surface-muted': '#1d2b40',
  '--ui-surface-accent': '#243450',
  '--ui-border': '#30405a',
  '--ui-text': '#f1f5fb',
  '--ui-text-muted': '#aeb9cd',
  '--ui-neutral-50': '#f6f8fb',
  '--ui-neutral-100': '#e6ebf2',
  '--ui-neutral-300': '#9aa6ba',
  '--ui-neutral-700': '#46536b',
  '--ui-neutral-900': '#0d1626',
  '--ui-brand-600': '#3563cf',
  '--ui-brand-700': '#9bc0f8',
  '--ui-accent-600': '#9bc0f8',
  '--ui-info-600': '#3aa6e0',
  '--ui-success-600': '#34c771',
  '--ui-warning-600': '#e0a23a',
  '--ui-warning-700': '#cf9036',
  '--ui-danger-600': '#f0795f',
  '--ui-neutral-500': '#aab6cb',
  '--ui-focus': '#5b8def',
  '--ui-shadow': '0 1px 2px rgba(0, 0, 0, 0.34)',
  '--ui-shadow-strong': '0 18px 44px -16px rgba(0, 0, 0, 0.64)',
  '--ui-nav-sidebar-bg': '#0a1322',
  '--ui-nav-hover-bg': '#1a2b46',
  '--ui-nav-active-bg': 'rgba(255, 255, 255, 0.14)',
  '--ui-nav-active-text': '#ffffff',
  '--ui-nav-text': '#e9eff9',
  '--ui-nav-text-muted': '#9fb0cd',
  '--ui-error-border': '#7f2418',
  '--ui-hero-bg': 'linear-gradient(135deg, #0e1c34 0%, #15325a 100%)',
  '--ui-hero-text': '#f4f8fe',
  '--ui-hero-muted': '#bcc9e0',
  '--ui-hero-eyebrow': '#9bb8ea',
  '--ui-hero-cta-bg': '#eef3fb',
  '--ui-hero-cta-bg-hover': '#ffffff',
  '--ui-hero-cta-text': '#11233f',
  '--ui-hero-seal': 'rgba(255, 255, 255, 0.08)'
} as const;
