import { semanticStatusMap } from '../../tokens/index';

import type { EntityStatus } from '@cdoprof/shared-types';
import type { ReactElement } from 'react';

export const StatusChip = ({ status }: { status: EntityStatus | string }): ReactElement => (
  <span
    className="ui-badge"
    style={{
      background:
        semanticStatusMap[(status as keyof typeof semanticStatusMap) ?? 'inactive'] ??
        'var(--ui-neutral-500)'
    }}
  >
    {status}
  </span>
);
