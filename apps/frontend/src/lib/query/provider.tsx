'use client';

import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';

interface CacheEntry<T> {
  data?: T;
  error?: string;
  updatedAt: number;
}

interface QueryContextValue {
  get: <T>(key: string) => CacheEntry<T> | undefined;
  set: <T>(key: string, value: CacheEntry<T>) => void;
  invalidate: (prefix?: string) => void;
  version: number;
}

const QueryContext = createContext<QueryContextValue | null>(null);

export const AppQueryProvider = ({ children }: PropsWithChildren) => {
  const [version, setVersion] = useState(0);
  const cache = useMemo(() => new Map<string, CacheEntry<unknown>>(), []);

  const value = useMemo<QueryContextValue>(
    () => ({
      get: (key) => cache.get(key),
      set: (key, entry) => {
        cache.set(key, entry as CacheEntry<unknown>);
        setVersion((v) => v + 1);
      },
      invalidate: (prefix) => {
        if (!prefix) {
          cache.clear();
        } else {
          for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
        }
        setVersion((v) => v + 1);
      },
      version
    }),
    [cache, version]
  );

  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>;
};

export const useQueryCache = () => {
  const context = useContext(QueryContext);
  if (!context) throw new Error('useQueryCache must be used inside AppQueryProvider');
  return context;
};

export const useInvalidateQuery = () => {
  const cache = useQueryCache();
  return useCallback((prefix?: string) => cache.invalidate(prefix), [cache]);
};

export interface QueryPolicy {
  dedupe: true;
  safeRetryCount: number;
  authSensitiveRetry: false;
}

export const defaultQueryPolicy: QueryPolicy = {
  dedupe: true,
  safeRetryCount: 2,
  authSensitiveRetry: false
};
