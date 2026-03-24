import type { AsyncTaskStatus } from '../../../../shared-types/src/index.ts';
import type { ReactElement } from 'react';

export const AsyncStatusWidget = ({ status }: { status: AsyncTaskStatus }): ReactElement => <div>Async task: {status}</div>;
