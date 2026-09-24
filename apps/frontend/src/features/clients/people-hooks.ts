'use client';

import { useQuery } from '@tanstack/react-query';

import { clientPeopleApi } from './people-api';
import { useAuth } from '../auth/context';

import type { ClientEmployeesFilters } from './people-types';

/** Контакты компании — грузятся, когда открыта вкладка «Контакты». */
export function useClientContacts(counterpartyId: string, enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['client-contacts', counterpartyId],
    enabled: Boolean(session) && enabled,
    queryFn: () => clientPeopleApi.listContacts(session!, counterpartyId),
    meta: { suppressGlobalErrorToast: true }
  });
}

/** Сотрудники компании страницей: поиск и статус — на сервере. */
export function useClientEmployees(
  counterpartyId: string,
  filters: ClientEmployeesFilters,
  enabled: boolean
) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['client-employees', counterpartyId, filters],
    enabled: Boolean(session) && enabled,
    queryFn: () => clientPeopleApi.listEmployees(session!, counterpartyId, filters),
    meta: { suppressGlobalErrorToast: true }
  });
}
