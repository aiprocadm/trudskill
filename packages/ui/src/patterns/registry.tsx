import { EmptyState, ErrorState, LoadingState } from '../components/states/index';

import type { PropsWithChildren, ReactElement } from 'react';

export const RegistryToolbar = ({ children }: PropsWithChildren): ReactElement => <div>{children}</div>;

export const RegistryFilterBar = ({ children }: PropsWithChildren): ReactElement => <div>{children}</div>;

export const RegistryTableState = ({ state }: { state: 'empty' | 'loading' | 'error' | 'forbidden' | 'ready' }): ReactElement | null => {
  if (state === 'empty') return <EmptyState />;
  if (state === 'loading') return <LoadingState />;
  if (state === 'error') return <ErrorState />;
  if (state === 'forbidden') return <ErrorState message="Forbidden" />;
  return null;
};
