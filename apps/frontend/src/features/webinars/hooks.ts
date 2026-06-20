import { useCallback, useEffect, useState } from 'react';

import {
  createWebinar,
  getProviderSettings,
  listMyWebinars,
  listWebinars,
  saveProviderSettings
} from './api';

import type { CreateWebinarInput, ProviderSettings, Webinar } from './types';

export function useWebinars() {
  const [items, setItems] = useState<Webinar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWebinars();
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: CreateWebinarInput) => {
      await createWebinar(input);
      await reload();
    },
    [reload]
  );

  return { items, error, loading, reload, create };
}

export function useMyWebinars() {
  const [items, setItems] = useState<Webinar[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listMyWebinars();
        if (!cancelled) setItems(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, error };
}

export function useProviderSettings() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getProviderSettings();
        if (!cancelled) setSettings(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (input: ProviderSettings) => {
    setSaving(true);
    try {
      const s = await saveProviderSettings(input);
      setSettings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, error, saving, save };
}
