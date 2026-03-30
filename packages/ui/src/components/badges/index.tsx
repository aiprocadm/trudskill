import type { EntityStatus } from '@cdoprof/shared-types';
import type { ReactElement } from 'react';
import { semanticStatusMap } from '../../tokens/index';

export const StatusChip = ({ status }: { status: EntityStatus | string }): ReactElement => (
  <span style={{ background: semanticStatusMap[(status as keyof typeof semanticStatusMap) ?? 'inactive'] ?? '#6b7280', color: '#fff', borderRadius: 999, padding: '2px 8px' }}>
    {status}
  </span>
);
