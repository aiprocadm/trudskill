'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { licensesApi } from './api';
import { useAuth } from '../auth/context';

import type {
  CreateLicensePayload,
  LicenseStatus,
  LicensesListResponse,
  UpdateLicensePayload
} from './types';

export function useLicenses(status?: LicenseStatus) {
  const { session } = useAuth();
  return useQuery<LicensesListResponse>({
    queryKey: ['licenses', status ?? 'all'],
    enabled: Boolean(session),
    queryFn: () => licensesApi.list(session!, status)
  });
}

/**
 * Лёгкая обёртка без `useMutation` — проект придерживается ручных wrappers
 * (см. `useDomainMutations` в mvp/hooks.ts). Возвращает три async-метода и
 * отдельные state-флаги; на success вызывает invalidate `['licenses']`.
 */
export function useLicensesMutations() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [createPending, setCreatePending] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [revokePending, setRevokePending] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['licenses'] });

  return {
    createPending,
    updatePending,
    revokePending,
    createLicense: async (payload: CreateLicensePayload) => {
      if (!session) throw new Error('Нет активной сессии');
      setCreatePending(true);
      try {
        const result = await licensesApi.create(session, payload);
        await invalidate();
        return result;
      } finally {
        setCreatePending(false);
      }
    },
    updateLicense: async (id: string, payload: UpdateLicensePayload) => {
      if (!session) throw new Error('Нет активной сессии');
      setUpdatePending(true);
      try {
        const result = await licensesApi.update(session, id, payload);
        await invalidate();
        return result;
      } finally {
        setUpdatePending(false);
      }
    },
    revokeLicense: async (id: string) => {
      if (!session) throw new Error('Нет активной сессии');
      setRevokePending(true);
      try {
        const result = await licensesApi.revoke(session, id);
        await invalidate();
        return result;
      } finally {
        setRevokePending(false);
      }
    }
  };
}
