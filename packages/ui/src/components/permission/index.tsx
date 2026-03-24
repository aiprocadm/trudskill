import type { PropsWithChildren, ReactElement } from 'react';

export const PermissionWrapper = ({ allowed, fallback = null, children }: PropsWithChildren<{ allowed: boolean; fallback?: ReactElement | null }>): ReactElement | null => (
  allowed ? <>{children}</> : fallback
);
