'use client';

import { useCallback, useEffect, useState } from 'react';

import { scormApi } from './api';
import { useAuth } from '../auth/context';

import type { ScormPackageDto } from './types';

export interface UseScormPackagesResult {
  packages: ScormPackageDto[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useScormPackages(): UseScormPackagesResult {
  const { session } = useAuth();
  const [packages, setPackages] = useState<ScormPackageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    scormApi
      .list(session)
      .then((resp) => {
        if (!cancelled) {
          setPackages(resp.items);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === 'object' && err !== null && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Не удалось загрузить SCORM-пакеты';
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, version]);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return { packages, loading, error, reload };
}
