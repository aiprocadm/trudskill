'use client';

import { useEffect, useState } from 'react';

import { useAuth } from './context';
import { ApiClientError } from '../../lib/api/client';
import { authApi } from '../../lib/auth/auth-api';

import type { TotpSetupResponse, TotpStatusResponse } from '../../lib/auth/auth-api';

/**
 * Настройка 2FA (TOTP) в профиле — ФТ-G3, Фаза 0 Task 5.
 * Доступна админским ролям (eligible с бэка); включение подтверждается кодом,
 * выключение тоже требует текущий код (угнанной сессии недостаточно).
 */
export const TwoFactorCard = () => {
  const { session } = useAuth();
  const accessToken = session?.tokens.accessToken;
  const [status, setStatus] = useState<TotpStatusResponse | null>(null);
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    authApi
      .totpStatus(accessToken)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить статус двухфакторной защиты.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken || loading) {
    return <p className="ui-page-subtitle">Загрузка…</p>;
  }
  if (!status?.eligible) {
    return (
      <p className="ui-page-subtitle" data-testid="totp-not-eligible">
        Двухфакторная защита доступна администраторам учебного центра и платформы.
      </p>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof ApiClientError
          ? actionError.normalized.message
          : 'Не удалось выполнить действие'
      );
    } finally {
      setSaving(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      const next = await authApi.totpSetup(accessToken);
      setSetup(next);
      setCode('');
    });

  const confirm = () =>
    run(async () => {
      await authApi.totpConfirm(code.trim(), accessToken);
      setStatus({ ...status, enabled: true, pending: false });
      setSetup(null);
      setCode('');
    });

  const disable = () =>
    run(async () => {
      await authApi.totpDisable(code.trim(), accessToken);
      setStatus({ ...status, enabled: false, pending: false });
      setCode('');
    });

  const codeInput = (id: string) => (
    <label htmlFor={id} className="ui-field">
      <span className="ui-field-label">Код из приложения</span>
      <input
        id={id}
        className="ui-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
    </label>
  );

  return (
    <div data-testid="totp-card">
      {status.enabled ? (
        <>
          <p>
            Двухфакторная защита <strong>включена</strong>: при входе после пароля требуется код из
            приложения-аутентификатора.
          </p>
          {codeInput('totp-disable-code')}
          <button
            className="ui-button"
            type="button"
            disabled={saving || !/^\d{6}$/.test(code.trim())}
            onClick={disable}
          >
            {saving ? 'Выключаем…' : 'Выключить 2FA'}
          </button>
        </>
      ) : setup ? (
        <>
          <p>
            Отсканируйте QR-код приложением-аутентификатором (Яндекс.Ключ, Google Authenticator,
            1Password…) и введите 6-значный код для подтверждения.
          </p>
          {/* data-URI с бэка — без внешних запросов */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qrDataUrl}
            alt="QR-код для приложения-аутентификатора"
            width={240}
            height={240}
          />
          <p className="ui-page-subtitle">
            Не получается отсканировать? Введите секрет вручную:{' '}
            <code data-testid="totp-secret">{setup.secret}</code>
          </p>
          {codeInput('totp-confirm-code')}
          <button
            className="ui-button ui-button--primary"
            type="button"
            disabled={saving || !/^\d{6}$/.test(code.trim())}
            onClick={confirm}
          >
            {saving ? 'Подтверждаем…' : 'Подтвердить и включить'}
          </button>
        </>
      ) : (
        <>
          <p>
            Двухфакторная защита выключена. Включите её, чтобы вход требовал не только пароль, но и
            код из приложения-аутентификатора.
          </p>
          <button
            className="ui-button ui-button--primary"
            type="button"
            disabled={saving}
            onClick={startSetup}
          >
            {saving ? 'Готовим…' : 'Включить 2FA'}
          </button>
        </>
      )}
      {error ? (
        <p role="alert" className="ui-error">
          {error}
        </p>
      ) : null}
    </div>
  );
};
