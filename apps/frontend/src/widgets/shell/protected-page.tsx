'use client';

import { AppShell } from './app-shell';
import { ProtectedRoute } from '../../features/auth/guards';

import type { PropsWithChildren } from 'react';

export const ProtectedPage = ({ children }: PropsWithChildren) => (
  <ProtectedRoute>
    <AppShell>{children}</AppShell>
  </ProtectedRoute>
);
