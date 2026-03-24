'use client';

import type { PropsWithChildren } from 'react';
import { ProtectedRoute } from '../../features/auth/guards';
import { AppShell } from './app-shell';

export const ProtectedPage = ({ children }: PropsWithChildren) => (
  <ProtectedRoute>
    <AppShell>{children}</AppShell>
  </ProtectedRoute>
);
