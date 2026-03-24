export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 6, md: 10, lg: 14 } as const;
export const typography = {
  body: '14px/1.5 system-ui',
  heading: '600 20px/1.2 system-ui',
  mono: '13px/1.4 ui-monospace'
} as const;
export const zIndex = { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300 } as const;

export const semanticStatusMap = {
  active: '#16a34a',
  inactive: '#6b7280',
  archived: '#7c2d12',
  pending: '#ca8a04',
  failed: '#b91c1c'
} as const;
