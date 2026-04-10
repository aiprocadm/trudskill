export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const shadows = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0 8px 24px rgba(16, 24, 40, 0.08)'
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

export const lightThemeVars = {
  '--ui-bg': '#f6f8fb',
  '--ui-surface': '#ffffff',
  '--ui-surface-muted': '#f3f4f6',
  '--ui-border': '#e4e7ec',
  '--ui-text': '#101828',
  '--ui-text-muted': '#475467',
  '--ui-brand-600': '#155eef',
  '--ui-brand-700': '#004eeb',
  '--ui-success-600': '#16a34a',
  '--ui-warning-600': '#d97706',
  '--ui-warning-700': '#b45309',
  '--ui-danger-600': '#dc2626',
  '--ui-neutral-500': '#667085',
  '--ui-focus': '#93c5fd',
  '--ui-shadow': shadows.sm,
  '--ui-shadow-strong': shadows.md
} as const;
