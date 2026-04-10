'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { apiRequest } from '../../lib/api/client';
import { useAuth } from '../auth/context';

export interface IntegrationProviderDto {
  id: string;
  code: string;
  name: string;
  providerType: string;
}
export interface IntegrationCredentialDto {
  id: string;
  name: string;
  status: string;
  secretMasked: string;
}
export interface ExportTaskDto {
  id: string;
  providerCode: string;
  exportType: string;
  status: string;
}
export interface SyncLogDto {
  id: string;
  providerCode: string;
  entityType: string;
  statusCode: number;
  status: string;
}

const useIntegrationList = <T>(key: string, path: string, liveInterval?: number) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['integrations', key],
    enabled: Boolean(session),
    queryFn: async () => {
      const result = await apiRequest<{ items: T[] }>(path);
      return result.items;
    },
    refetchInterval: liveInterval
  });

  useEffect(() => {
    if (!session) {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    }
  }, [queryClient, session]);

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};

export const useProviders = () =>
  useIntegrationList<IntegrationProviderDto>('providers', '/integrations/providers');
export const useCredentials = () =>
  useIntegrationList<IntegrationCredentialDto>('credentials', '/integrations/credentials');
export const useExportTasks = (live = false) =>
  useIntegrationList<ExportTaskDto>('exportTasks', '/exports/tasks', live ? 15_000 : undefined);
export const useSyncLogs = () => useIntegrationList<SyncLogDto>('syncLogs', '/sync-logs');
