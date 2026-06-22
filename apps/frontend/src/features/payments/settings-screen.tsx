'use client';

import { LoadingState } from '@cdoprof/ui';
import { useEffect, useState } from 'react';

import { getPaymentProviderSettings, savePaymentProviderSettings } from './api';
import {
  PAYMENT_PROVIDER_LABELS,
  type PaymentProviderCode,
  type PaymentProviderSettings
} from './types';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';

const PROVIDERS: PaymentProviderCode[] = [
  'noop',
  'fake',
  'yookassa',
  'tinkoff',
  'cloudpayments',
  'robokassa'
];

export function PaymentProviderSettingsScreen() {
  const [settings, setSettings] = useState<PaymentProviderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState<PaymentProviderCode>('noop');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getPaymentProviderSettings();
        if (!cancelled) {
          setSettings(s);
          setCode(s.providerCode as PaymentProviderCode);
          setEnabled(s.enabled);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const s = await savePaymentProviderSettings({ providerCode: code, enabled });
      setSettings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Платёжный провайдер"
        subtitle="Выбор провайдера оплаты для этого учебного центра"
      />
      <SectionCard title="Настройки">
        {error ? <SectionError message={error} /> : null}
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {settings ? (
              <div className="ui-list-row-meta">
                Текущий: {settings.providerCode} · {settings.enabled ? 'включён' : 'выключен'}
              </div>
            ) : null}
            <div className="ui-inline">
              <select value={code} onChange={(e) => setCode(e.target.value as PaymentProviderCode)}>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />{' '}
                Включён
              </label>
              <button type="button" className="ui-button" disabled={saving} onClick={save}>
                Сохранить
              </button>
            </div>
          </>
        )}
      </SectionCard>
    </PageContainer>
  );
}
