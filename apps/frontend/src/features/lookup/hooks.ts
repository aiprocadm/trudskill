'use client';

import { useQuery } from '@tanstack/react-query';

import { lookupApi } from './api';
import { useAuth } from '../auth/context';

/** Подсказки должностей центра по введённому тексту (МГ-C1.2); пустой запрос — первые 50. */
export function usePositionSuggestions(q: string) {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['lookup', 'positions', session?.user.tenantId, q.trim().toLowerCase()],
    enabled: Boolean(session),
    queryFn: () => lookupApi.positions(session!, q),
    meta: { suppressGlobalErrorToast: true }
  });
  return (query.data?.items ?? []).map((item) => item.name);
}

export function useEducationLevels() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['lookup', 'education-levels'],
    enabled: Boolean(session),
    queryFn: () => lookupApi.educationLevels(session!),
    meta: { suppressGlobalErrorToast: true }
  });
  return query.data?.items ?? [];
}

export function useCountries() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['lookup', 'countries'],
    enabled: Boolean(session),
    queryFn: () => lookupApi.countries(session!),
    meta: { suppressGlobalErrorToast: true }
  });
  return (query.data?.items ?? []).map((item) => item.name);
}
