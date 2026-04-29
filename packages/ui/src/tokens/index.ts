export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const shadows = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.08)',
  md: '0 10px 30px rgba(16, 24, 40, 0.12)'
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
  '--ui-bg': '#f5f7fb',
  '--ui-surface': '#ffffff',
  '--ui-surface-muted': '#f8fafc',
  '--ui-surface-accent': '#eef4ff',
  '--ui-border': '#e2e8f0',
  '--ui-text': '#0f172a',
  '--ui-text-muted': '#475569',
  '--ui-neutral-50': '#f8fafc',
  '--ui-neutral-100': '#f1f5f9',
  '--ui-neutral-300': '#cbd5e1',
  '--ui-neutral-700': '#334155',
  '--ui-neutral-900': '#0f172a',
  '--ui-brand-600': '#2563eb',
  '--ui-brand-700': '#1d4ed8',
  '--ui-accent-600': '#7c3aed',
  '--ui-info-600': '#0284c7',
  '--ui-success-600': '#16a34a',
  '--ui-warning-600': '#d97706',
  '--ui-warning-700': '#b45309',
  '--ui-danger-600': '#dc2626',
  '--ui-neutral-500': '#64748b',
  '--ui-focus': '#93c5fd',
  '--ui-shadow': shadows.sm,
  '--ui-shadow-strong': shadows.md,
  '--ui-nav-sidebar-bg': '#f8fbff',
  '--ui-nav-hover-bg': '#eaf1ff',
  '--ui-nav-active-bg': 'rgba(37, 99, 235, 0.1)',
  '--ui-nav-active-text': '#1e40af',
  '--ui-error-border': '#fecaca'
} as const;

export const darkThemeVars = {
  '--ui-bg': '#0f172a',
  '--ui-surface': '#1e293b',
  '--ui-surface-muted': '#334155',
  '--ui-surface-accent': '#1f2a44',
  '--ui-border': '#475569',
  '--ui-text': '#f8fafc',
  '--ui-text-muted': '#94a3b8',
  '--ui-neutral-50': '#f8fafc',
  '--ui-neutral-100': '#e2e8f0',
  '--ui-neutral-300': '#94a3b8',
  '--ui-neutral-700': '#334155',
  '--ui-neutral-900': '#0f172a',
  '--ui-brand-600': '#3b82f6',
  '--ui-brand-700': '#60a5fa',
  '--ui-accent-600': '#a78bfa',
  '--ui-info-600': '#38bdf8',
  '--ui-success-600': '#22c55e',
  '--ui-warning-600': '#fbbf24',
  '--ui-warning-700': '#f59e0b',
  '--ui-danger-600': '#f87171',
  '--ui-neutral-500': '#94a3b8',
  '--ui-focus': '#60a5fa',
  '--ui-shadow': '0 1px 2px rgba(0, 0, 0, 0.35)',
  '--ui-shadow-strong': '0 10px 30px rgba(0, 0, 0, 0.45)',
  '--ui-nav-sidebar-bg': '#172033',
  '--ui-nav-hover-bg': '#24344f',
  '--ui-nav-active-bg': 'rgba(59, 130, 246, 0.22)',
  '--ui-nav-active-text': '#bfdbfe',
  '--ui-error-border': '#7f1d1d'
} as const;
