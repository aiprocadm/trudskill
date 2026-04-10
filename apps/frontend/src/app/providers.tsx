'use client';

import { AuthProvider } from '../features/auth/context';
import { AppQueryProvider } from '../lib/query/provider';

import type { PropsWithChildren } from 'react';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <AppQueryProvider>
    <AuthProvider>{children}</AuthProvider>
  </AppQueryProvider>
);
