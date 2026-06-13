import { semanticStatusMap } from '../../tokens/index';

import type { EntityStatus } from '@cdoprof/shared-types';
import type { ReactElement } from 'react';

export const StatusChip = ({
  status,
  label
}: {
  status: EntityStatus | string;
  label?: string;
}): ReactElement => (
  <span
    className="ui-badge"
    style={{
      background:
        semanticStatusMap[(status as keyof typeof semanticStatusMap) ?? 'inactive'] ??
        'var(--ui-neutral-500)'
    }}
  >
    {label ?? status}
  </span>
);
