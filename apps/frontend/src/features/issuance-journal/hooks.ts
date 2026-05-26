'use client';

import { useQuery } from '@tanstack/react-query';

import { issuanceJournalApi } from './api';
import { useAuth } from '../auth/context';

import type { IssuanceJournalFilter, IssuanceJournalPage } from './types';

export function useIssuanceJournal(filter: IssuanceJournalFilter) {
  const { session } = useAuth();
  return useQuery<IssuanceJournalPage>({
    queryKey: ['issuance-journal', filter],
    enabled: Boolean(session),
    queryFn: () => issuanceJournalApi.list(session!, filter)
  });
}
