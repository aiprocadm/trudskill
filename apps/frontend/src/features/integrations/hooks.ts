'use client';

import { useEffect, useState } from 'react';

import { apiRequest } from '../../lib/api/client';

const useLoad = <T>(path: string, deps: unknown[] = []) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<{ items: T }>(path)
      .then((result) => {
        if (active) setData(result.items);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Ошибка API');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, deps);

  return { data, loading, error };
};

export const useProviders = () => useLoad<any[]>('/integrations/providers', []);
export const useCredentials = () => useLoad<any[]>('/integrations/credentials', []);
export const useExportTasks = (tick: number) => useLoad<any[]>('/exports/tasks', [tick]);
export const useSyncLogs = () => useLoad<any[]>('/sync-logs', []);
