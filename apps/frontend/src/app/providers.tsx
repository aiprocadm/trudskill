'use client';

import { UiThemeProvider } from '@cdoprof/ui';

import { AuthProvider } from '../features/auth/context';
import { AppQueryProvider } from '../lib/query/provider';

import type { PropsWithChildren } from 'react';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <UiThemeProvider>
    <AppQueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </AppQueryProvider>
  </UiThemeProvider>
);
