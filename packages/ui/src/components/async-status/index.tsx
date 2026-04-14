import { AsyncTaskStatus } from '@cdoprof/shared-types';

import { semanticStatusMap } from '../../tokens';

import type { ReactElement } from 'react';

const statusLabelRu: Record<AsyncTaskStatus, string> = {
  [AsyncTaskStatus.Queued]: 'В очереди',
  [AsyncTaskStatus.Running]: 'Выполняется',
  [AsyncTaskStatus.Succeeded]: 'Успешно',
  [AsyncTaskStatus.Failed]: 'Ошибка',
  [AsyncTaskStatus.Canceled]: 'Отменено'
};

const toSemanticKey = (status: AsyncTaskStatus): keyof typeof semanticStatusMap => {
  switch (status) {
    case AsyncTaskStatus.Queued:
      return 'queued';
    case AsyncTaskStatus.Running:
      return 'running';
    case AsyncTaskStatus.Succeeded:
      return 'completed';
    case AsyncTaskStatus.Failed:
      return 'failed';
    case AsyncTaskStatus.Canceled:
      return 'cancelled';
    default:
      return 'pending';
  }
};

export const AsyncStatusWidget = ({ status }: { status: AsyncTaskStatus }): ReactElement => {
  const label = statusLabelRu[status] ?? String(status);
  const color = semanticStatusMap[toSemanticKey(status)];
  return (
    <span className="ui-inline" style={{ alignItems: 'center', gap: 8 }}>
      <span className="ui-badge" style={{ background: color }}>
        {label}
      </span>
      <span className="ui-text-muted" style={{ fontSize: 13 }}>
        Фоновая задача
      </span>
    </span>
  );
};
