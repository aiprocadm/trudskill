import type { ReactElement, ReactNode } from 'react';

import { EntityStatus } from '@cdoprof/shared-types';

import { semanticStatusMap } from '../../tokens/index';

export interface BadgeProps {
  status: EntityStatus | string;
  children?: ReactNode;
}

export function Badge({ status, children }: BadgeProps): ReactElement {
  const background =
    semanticStatusMap[(status as keyof typeof semanticStatusMap) ?? 'inactive'] ?? '#6b7280';

  return (
    <span
      style={{
        background,
        color: '#fff',
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'capitalize'
      }}
    >
      {children ?? status}
    </span>
  );
}

export const StatusChip = Badge;
