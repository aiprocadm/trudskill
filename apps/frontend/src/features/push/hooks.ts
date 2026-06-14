'use client';

import { useCallback, useEffect, useState } from 'react';

import { pushApi } from './api';
import { isPushSupported, serializeSubscription, urlBase64ToUint8Array } from './push-logic';

import type { UserSession } from '../../entities/session/model';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export interface UsePushSubscription {
  /** Push is usable: browser supports it AND the backend has it enabled with a key. */
  supported: boolean;
  /** Browser Notification permission, or 'unsupported'. */
  permission: PermissionState;
  isSubscribed: boolean;
  loading: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

/**
 * Phase 10 Track C — drives the push subscription UI. Reads GET /web-push/public-key first:
 * if the backend reports push disabled (or the browser lacks support), `supported` is false and
 * the UI hides itself. subscribe()/unsubscribe() use the browser PushManager + the self-service
 * endpoints. State is plain useState/async (repo convention — no React Query mutations).
 */
export function usePushSubscription(session: UserSession | null): UsePushSubscription {
  const [enabled, setEnabled] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [browserSupported, setBrowserSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect browser support + current permission + backend config on mount.
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      isPushSupported(window as unknown as Record<string, unknown>);
    setBrowserSupported(supported);
    setPermission(supported ? (Notification.permission as PermissionState) : 'unsupported');
    if (!supported || !session) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const config = await pushApi.getPublicKey(session);
        if (cancelled) return;
        setEnabled(config.enabled);
        setPublicKey(config.publicKey);
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(Boolean(existing));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Не удалось загрузить настройки push');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const subscribe = useCallback(async () => {
    if (!session || !publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== 'granted') {
        setError('Разрешение на уведомления не предоставлено');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // urlBase64ToUint8Array returns a Uint8Array; cast to BufferSource (lib.dom narrows to
        // ArrayBuffer-backed views, but the runtime value is a valid application server key).
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
      });
      await pushApi.subscribe(
        session,
        serializeSubscription(sub.toJSON() as never, navigator.userAgent)
      );
      setIsSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось включить push-уведомления');
    } finally {
      setLoading(false);
    }
  }, [session, publicKey]);

  const unsubscribe = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await pushApi.unsubscribe(session, sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отключить push-уведомления');
    } finally {
      setLoading(false);
    }
  }, [session]);

  return {
    supported: browserSupported && enabled,
    permission,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe
  };
}
