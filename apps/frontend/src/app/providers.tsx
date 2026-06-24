'use client';

import { UiThemeProvider } from '@trudskill/ui';

import { AuthProvider } from '../features/auth/context';
import { AppQueryProvider } from '../lib/query/provider';
import { QueryErrorToastBridge } from '../lib/query/query-error-toasts';
import { ToastProvider } from '../lib/toast/toast-provider';
import { ToastRegistrar } from '../lib/toast/toast-registrar';

import type { PropsWithChildren } from 'react';

export const AppProviders = ({ children }: PropsWithChildren) => (
  <UiThemeProvider>
    <ToastProvider>
      <ToastRegistrar />
      <AppQueryProvider>
        <QueryErrorToastBridge>
          <AuthProvider>{children}</AuthProvider>
        </QueryErrorToastBridge>
      </AppQueryProvider>
    </ToastProvider>
  </UiThemeProvider>
);
