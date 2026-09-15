import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { QUERY_RETRY_POLICY, backoffFor } from './retry-policy';

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

  /*
   * Предохранитель ТЗ 1.1.3: автоматические попытки считаются, и после потолка неудач подряд
   * опрос ОСТАНАВЛИВАЕТСЯ — экран остаётся в состоянии ошибки.
   *
   * Что было: `refetchInterval` (восемь экранов, 5–15 секунд) не прекращался никогда. Сервер
   * лежит, человек видит ошибку, а вкладка продолжает слать запросы до её закрытия. Несколько
   * вкладок — постоянный поток, который при отказе базы не уменьшается: это и есть задача 1.2.
   *
   * Ручное «Повторить» счётчик ОБНУЛЯЕТ: запирать человека нельзя, решение продолжать — его.
   */
  const failures = useRef(0);
  const stopped = useRef(false);
  const nextAttemptAt = useRef(0);

  const run = useCallback(async (mode: 'auto' | 'manual') => {
    const current = optionsRef.current;
    if (current.enabled === false) return;
    if (mode === 'manual') {
      failures.current = 0;
      stopped.current = false;
      nextAttemptAt.current = 0;
    } else {
      if (stopped.current) return;
      if (Date.now() < nextAttemptAt.current) return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await current.queryFn();
      if (mounted.current) setData(result);
      failures.current = 0;
      nextAttemptAt.current = 0;
    } catch (err) {
      failures.current += 1;
      nextAttemptAt.current = Date.now() + backoffFor(failures.current);
      if (failures.current >= QUERY_RETRY_POLICY.maxConsecutiveFailures) stopped.current = true;
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

  /** То, что зовёт экран кнопкой «Повторить», — всегда ручная попытка. */
  const refetch = useCallback(() => run('manual'), [run]);

  useEffect(() => {
    mounted.current = true;
    void run('auto');
    return () => {
      mounted.current = false;
    };
  }, [queryKeyHash, options.enabled, run]);

  useEffect(() => {
    /* Обновление после успешной правки — повод считать сервер живым: попытка ручная. */
    const unsubscribe = client.subscribe(() => void run('manual'));
    return () => {
      unsubscribe();
    };
  }, [client, queryKeyHash, run]);

  useEffect(() => {
    if (!options.refetchInterval) return;
    const timer = setInterval(() => void run('auto'), options.refetchInterval);
    return () => clearInterval(timer);
  }, [options.refetchInterval, queryKeyHash, run]);

  return useMemo(() => ({ data, error, isLoading, refetch }), [data, error, isLoading, refetch]);
};
