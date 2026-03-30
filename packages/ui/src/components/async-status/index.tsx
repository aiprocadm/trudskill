import type { AsyncTaskStatus } from '@cdoprof/shared-types';
import type { ReactElement } from 'react';

export const AsyncStatusWidget = ({ status }: { status: AsyncTaskStatus }): ReactElement => <div>Async task: {status}</div>;
