'use client';

import { LoadingState } from '@trudskill/ui';
import { useEffect, useState } from 'react';

import {
  VIDEO_PROVIDER_CODES,
  VIDEO_PROVIDER_LABELS,
  type VideoProviderCode,
  type VideoProviderSettings,
  getVideoProviderSettings,
  saveVideoProviderSettings
} from './provider-settings.api';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useUnsavedForm } from '../../components/use-unsaved-form';
import { useAuth } from '../auth/context';

/**
 * Настройка видеопоставщика центра (ФТ-B1.1, журнал 309).
 *
 * Без права `video.configure` секция не показывается целиком. Пока поставщик не выбран,
 * разрешитель отдаёт «выключено» — видео в курсах не воспроизводится, и до этой секции
 * включить его было нечем.
 */
export function VideoProviderSettingsSection() {
  const { session } = useAuth();
  const [settings, setSettings] = useState<VideoProviderSettings | null>(null);
  const [code, setCode] = useState<VideoProviderCode>('noop');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = session?.permissions.includes('video.configure') ?? false;

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await getVideoProviderSettings();
        if (cancelled) return;
        setSettings(s);
        setCode(s.providerCode);
        setBaseUrl(s.baseUrl ?? '');
        setEnabled(s.enabled);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить настройки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  /*
   * Защита от потери несохранённых правок (ТЗ 10.3). Исходное запоминается заново, когда
   * приходят настройки с сервера и когда их сохранили: иначе приход данных сам выглядел бы
   * как правка человека.
   */
  const unsavedGuard = useUnsavedForm(
    { code, baseUrl, enabled },
    { saving, baselineKey: JSON.stringify(settings) }
  );

  if (!allowed) return null;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveVideoProviderSettings({
        providerCode: code,
        enabled,
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {})
      });
      setSettings(saved);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Видео в курсах">
      {unsavedGuard}
      {error ? <SectionError message={error} /> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="ui-list-row-meta">
            Где хранятся и откуда проигрываются учебные видео. Пока поставщик не выбран, видео в
            курсах не воспроизводится.
          </div>
          {settings ? (
            <div className="ui-list-row-meta">
              Сейчас: {VIDEO_PROVIDER_LABELS[settings.providerCode]} ·{' '}
              {settings.enabled ? 'включено' : 'выключено'}
            </div>
          ) : null}
          <div className="ui-inline">
            <label>
              Поставщик{' '}
              <select value={code} onChange={(e) => setCode(e.target.value as VideoProviderCode)}>
                {VIDEO_PROVIDER_CODES.map((p) => (
                  <option key={p} value={p}>
                    {VIDEO_PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Адрес установки{' '}
              <input
                type="text"
                value={baseUrl}
                maxLength={500}
                placeholder="Нужен своему хранилищу и стенду поставщика"
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{' '}
              Включено
            </label>
            <button type="button" className="ui-button" disabled={saving} onClick={save}>
              Сохранить настройки видео
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
