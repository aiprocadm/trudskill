import type { ReactElement } from 'react';

import { EntityStatus } from '@cdoprof/shared-types';

import { Badge } from '../badges/index';
import { Card, Stack } from '../../primitives/layout';

export interface DemoCardProps {
  title: string;
  description?: string;
  status?: EntityStatus;
}

export function DemoCard({
  title,
  description = 'UI foundation package is connected and ready for registry screens.',
  status = EntityStatus.Active
}: DemoCardProps): ReactElement {
  return (
    <Card>
      <Stack gap={12}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p style={{ margin: 0, color: '#4b5563' }}>{description}</p>
        <div>
          <Badge status={status}>{status}</Badge>
        </div>
      </Stack>
    </Card>
  );
}
