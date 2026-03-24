'use client';

import type { PropsWithChildren } from 'react';
import { AuthProvider } from '../features/auth/context';
import { AppQueryProvider } from '../lib/query/provider';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <AppQueryProvider>
    <AuthProvider>{children}</AuthProvider>
  </AppQueryProvider>
);
