'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../../lib/api/client';
import { useQueryCache } from '../../lib/query/provider';

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

const useLoad = <T>(key: string, path: string, liveInterval?: number) => {
  const cache = useQueryCache();
  const [data, setData] = useState<T[]>(() => cache.get<T[]>(key)?.data ?? []);
  const [loading, setLoading] = useState(!cache.get<T[]>(key));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ items: T[] }>(path);
      cache.set(key, { data: result.items, updatedAt: Date.now() });
      setData(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка API');
    } finally {
      setLoading(false);
    }
  }, [cache, key, path]);

  useEffect(() => {
    void refetch();
  }, [refetch]);
  useEffect(() => {
    if (!liveInterval) return;
    const timer = setInterval(() => void refetch(), liveInterval);
    return () => clearInterval(timer);
  }, [liveInterval, refetch]);

  return { data, loading, error, refetch };
};

export const useProviders = () =>
  useLoad<IntegrationProviderDto>('integrations.providers', '/integrations/providers');
export const useCredentials = () =>
  useLoad<IntegrationCredentialDto>('integrations.credentials', '/integrations/credentials');
export const useExportTasks = (live = false) =>
  useLoad<ExportTaskDto>('integrations.exportTasks', '/exports/tasks', live ? 15000 : undefined);
export const useSyncLogs = () => useLoad<SyncLogDto>('integrations.syncLogs', '/sync-logs');
