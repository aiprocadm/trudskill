import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type { PropsWithChildren } from 'react';

type QueryKey = readonly unknown[];

export type QueryMeta = { suppressGlobalErrorToast?: boolean };

interface QueryOptions<T> {
  // shim
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  enabled?: boolean;
  refetchInterval?: number | undefined;
  meta?: QueryMeta;
}

type QueryErrorListener = (error: unknown, queryKey: QueryKey) => void;

const queryErrorListeners = new Set<QueryErrorListener>();

/** Подписка на ошибки запросов (для глобальных тостов и т.п.). */
export const subscribeQueryErrors = (listener: QueryErrorListener) => {
  queryErrorListeners.add(listener);
  return () => {
    queryErrorListeners.delete(listener);
  };
};

export class QueryClient {
  constructor(_options?: unknown) {}
  private listeners = new Set<() => void>();
  invalidateQueries(_args?: { queryKey?: QueryKey }) {
    this.listeners.forEach((fn) => fn());
    return Promise.resolve();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const QueryContext = createContext<QueryClient | null>(null);

export const QueryClientProvider = ({
  client,
  children
}: PropsWithChildren<{ client: QueryClient }>) => (
  <QueryContext.Provider value={client}>{children}</QueryContext.Provider>
);

export const useQueryClient = () => {
  const context = useContext(QueryContext);
  if (!context) throw new Error('useQueryClient must be used inside QueryClientProvider');
  return context;
};

export const useQuery = <T,>(options: QueryOptions<T>) => {
  const client = useQueryClient();
  const mounted = useRef(true);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setLoading] = useState(Boolean(options.enabled ?? true));

  const queryKeyHash = JSON.stringify(options.queryKey);

  // Вызывающий код передаёт объект опций и queryFn инлайном — их идентичность меняется на
  // каждом рендере. Завязывать refetch на эту идентичность нельзя: эффект монтирования тогда
  // перезапускается после каждого рендера, и запрос уходит в вечный цикл
  // (запрос → setState → рендер → новый refetch → эффект → запрос). Свежие опции читаются
  // через ref в момент вызова, а сам refetch стабилен между рендерами.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const refetch = useCallback(async () => {
    const current = optionsRef.current;
    if (current.enabled === false) return;
    setLoading(true);
    setError(null);
    try {
      const result = await current.queryFn();
      if (mounted.current) setData(result);
    } catch (err) {
      if (mounted.current) setError(err);
      if (!current.meta?.suppressGlobalErrorToast) {
        queryErrorListeners.forEach((fn) => {
          try {
            fn(err, current.queryKey);
          } catch {
            /* ignore listener errors */
          }
        });
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refetch();
    return () => {
      mounted.current = false;
    };
  }, [queryKeyHash, options.enabled, refetch]);

  useEffect(() => {
    const unsubscribe = client.subscribe(() => void refetch());
    return () => {
      unsubscribe();
    };
  }, [client, queryKeyHash, refetch]);

  useEffect(() => {
    if (!options.refetchInterval) return;
    const timer = setInterval(() => void refetch(), options.refetchInterval);
    return () => clearInterval(timer);
  }, [options.refetchInterval, queryKeyHash, refetch]);

  return useMemo(() => ({ data, error, isLoading, refetch }), [data, error, isLoading, refetch]);
};
