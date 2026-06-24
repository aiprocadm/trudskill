import { statusAccessibleLabel } from './status-label';
import { semanticStatusMap } from '../../tokens/index';

import type { EntityStatus } from '@trudskill/shared-types';
import type { ReactElement } from 'react';

export const StatusChip = ({
  status,
  label
}: {
  status: EntityStatus | string;
  label?: string;
}): ReactElement => {
  // Текст внутри чипа — НЕ-цветовой носитель смысла (WCAG 1.4.1). `title` даёт hover-подсказку.
  const text = label ?? statusAccessibleLabel(status);
  return (
    <span
      className="ui-badge"
      title={text}
      style={{
        background:
          semanticStatusMap[(status as keyof typeof semanticStatusMap) ?? 'inactive'] ??
          'var(--ui-neutral-500)'
      }}
    >
      {text}
    </span>
  );
};
