'use client';

import { LoadingState } from '@trudskill/ui';
import { useEffect, useState } from 'react';

import {
  SMS_PROVIDER_CODES,
  SMS_PROVIDER_LABELS,
  type SmsProviderCode,
  type SmsProviderSettings,
  getSmsProviderSettings,
  saveSmsProviderSettings
} from './api';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useUnsavedForm } from '../../components/use-unsaved-form';
import { useAuth } from '../auth/context';

/**
 * Настройка СМС-поставщика центра (ФТ-C1.3, журнал 309).
 *
 * Секция встраивается в общий экран «Настройки» рядом с оплатой и вебинарами — все контуры
 * поставщиков настраиваются одинаково. Без права `sms.configure` секция не показывается
 * целиком: пустая рамка выглядела бы как поломка.
 *
 * Смысл настройки для человека: СМС дублирует письмо со ссылкой на экзамен. Письмо работает
 * всегда, СМС — только если центр подключил оператора и платит за сообщения. Поэтому
 * умолчание «не отправлять».
 */
export function SmsProviderSettingsSection() {
  const { session } = useAuth();
  const [settings, setSettings] = useState<SmsProviderSettings | null>(null);
  const [code, setCode] = useState<SmsProviderCode>('noop');
  const [senderName, setSenderName] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = session?.permissions.includes('sms.configure') ?? false;

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await getSmsProviderSettings();
        if (cancelled) return;
        setSettings(s);
        setCode(s.providerCode);
        setSenderName(s.senderName ?? '');
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
    { code, senderName, enabled },
    { saving, baselineKey: JSON.stringify(settings) }
  );

  if (!allowed) return null;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveSmsProviderSettings({
        providerCode: code,
        enabled,
        ...(senderName.trim() ? { senderName: senderName.trim() } : {})
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
    <SectionCard title="Оповещения по СМС">
      {unsavedGuard}
      {error ? <SectionError message={error} /> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="ui-list-row-meta">
            СМС дублирует письмо со ссылкой на экзамен. Письмо уходит всегда; СМС — только если
            центр подключил оператора: каждое сообщение платное.
          </div>
          {settings ? (
            <div className="ui-list-row-meta">
              Сейчас: {SMS_PROVIDER_LABELS[settings.providerCode]} ·{' '}
              {settings.enabled ? 'отправка включена' : 'отправка выключена'}
            </div>
          ) : null}
          <div className="ui-inline">
            <label>
              Оператор{' '}
              <select value={code} onChange={(e) => setCode(e.target.value as SmsProviderCode)}>
                {SMS_PROVIDER_CODES.map((p) => (
                  <option key={p} value={p}>
                    {SMS_PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Имя отправителя{' '}
              <input
                type="text"
                value={senderName}
                maxLength={120}
                placeholder="Как центр зарегистрирован у оператора"
                onChange={(e) => setSenderName(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{' '}
              Отправлять СМС
            </label>
            <button type="button" className="ui-button" disabled={saving} onClick={save}>
              Сохранить настройки СМС
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
