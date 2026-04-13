'use client';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

export type ToastVariant = 'error' | 'success' | 'info';

export type ToastItem = {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
};

type ToastContextValue = {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
};

const TOAST_TTL_MS = 6500;

export const ToastProvider = ({ children }: PropsWithChildren) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const item: ToastItem = { ...toast, id };
      setToasts((list) => [...list, item]);
      const timer = setTimeout(() => remove(id), TOAST_TTL_MS);
      timers.current.set(id, timer);
    },
    [remove]
  );

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    []
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Уведомления"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 360,
          pointerEvents: 'none'
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              borderRadius: 12,
              padding: '12px 14px',
              border: '1px solid var(--ui-border)',
              background: 'var(--ui-surface)',
              color: 'var(--ui-text)',
              boxShadow: 'var(--ui-shadow-strong)',
              borderLeftWidth: 4,
              borderLeftColor:
                t.variant === 'error'
                  ? 'var(--ui-danger-600)'
                  : t.variant === 'success'
                    ? 'var(--ui-success-600)'
                    : 'var(--ui-brand-600)'
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
            {t.message ? (
              <div style={{ fontSize: 13, marginTop: 4, color: 'var(--ui-text-muted)' }}>{t.message}</div>
            ) : null}
            <button
              type="button"
              onClick={() => remove(t.id)}
              style={{
                marginTop: 8,
                height: 32,
                fontSize: 13,
                border: '1px solid var(--ui-border)',
                borderRadius: 8,
                background: 'var(--ui-surface-muted)',
                cursor: 'pointer'
              }}
            >
              Закрыть
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
