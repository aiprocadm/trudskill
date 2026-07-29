'use client';

import { AppShell } from './app-shell';
import { ProtectedRoute } from '../../features/auth/guards';
import { AgreementGate } from '../../features/esignature/agreement-gate';

import type { PropsWithChildren } from 'react';

export const ProtectedPage = ({ children }: PropsWithChildren) => (
  <ProtectedRoute>
    {/*
      ФТ-C1.1: соглашение принимается ДО работы в системе — иначе накопятся действия,
      которые нечем подписать. Гейт внутри AppShell, чтобы навигация и выход остались
      доступны: запертый без выхода пользователь — худший вариант.
    */}
    <AppShell>
      <AgreementGate>{children}</AgreementGate>
    </AppShell>
  </ProtectedRoute>
);
