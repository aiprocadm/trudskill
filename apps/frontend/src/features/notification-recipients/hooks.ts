'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { notificationRecipientsApi } from './api';
import { useAuth } from '../auth/context';

export function useNotificationRecipients() {
  const { session } = useAuth();
  return useQuery<string[]>({
    queryKey: ['notification-staff-recipients'],
    enabled: Boolean(session),
    queryFn: () => notificationRecipientsApi.get(session!)
  });
}

/** Ручная обёртка без useMutation — общий паттерн проекта (см. recertification/hooks). */
export function useNotificationRecipientsMutation() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [savePending, setSavePending] = useState(false);

  return {
    savePending,
    save: async (emails: string[]): Promise<string[]> => {
      if (!session) throw new Error('Нет активной сессии');
      setSavePending(true);
      try {
        const result = await notificationRecipientsApi.set(session, emails);
        await queryClient.invalidateQueries({ queryKey: ['notification-staff-recipients'] });
        return result;
      } finally {
        setSavePending(false);
      }
    }
  };
}
