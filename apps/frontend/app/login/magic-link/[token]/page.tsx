'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../../src/features/auth/context';
import { resolveSafeNextPath } from '../../../../src/features/auth/login-form';
import { ApiClientError } from '../../../../src/lib/api/client';

type RedeemStatus = 'pending' | 'error' | 'totp';

export default function MagicLinkRedeemPage() {
  const params = useParams<{ token: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithMagicLink, verifyTotp } = useAuth();
  const [status, setStatus] = useState<RedeemStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // ФТ-G3: у пользователя включена 2FA — ссылка погашена, но вход завершается кодом.
  const [totpChallenge, setTotpChallenge] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpPending, setTotpPending] = useState(false);
  const consumedRef = useRef(false);

  const rawTokenParam = params?.token;
  const token = Array.isArray(rawTokenParam) ? rawTokenParam[0] : rawTokenParam;

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Ссылка для входа повреждена или неполная.');
      return;
    }

    if (consumedRef.current) return;
    consumedRef.current = true;

    let cancelled = false;
    loginWithMagicLink(token)
      .then((outcome) => {
        if (cancelled) return;
        if ('totpRequired' in outcome) {
          setTotpChallenge(outcome.challengeToken);
          setStatus('totp');
          return;
        }
        router.replace(resolveSafeNextPath(searchParams?.get('next') ?? null));
      })
      .catch((redeemError: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          redeemError instanceof ApiClientError
            ? redeemError.normalized.message
            : 'Ссылка недействительна или истекла. Запросите новую.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [loginWithMagicLink, router, searchParams, token]);

  if (status === 'totp') {
    const onSubmitTotp = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!totpChallenge || !/^\d{6}$/.test(totpCode.trim())) {
        setErrorMessage('Введите 6-значный код из приложения.');
        return;
      }
      setTotpPending(true);
      setErrorMessage(null);
      try {
        await verifyTotp(totpChallenge, totpCode.trim());
        router.replace(resolveSafeNextPath(searchParams?.get('next') ?? null));
      } catch (verifyError) {
        setErrorMessage(
          verifyError instanceof ApiClientError
            ? verifyError.normalized.message
            : 'Не удалось подтвердить код'
        );
      } finally {
        setTotpPending(false);
      }
    };
    return (
      <main className="ui-login-center">
        <form
          onSubmit={onSubmitTotp}
          className="ui-section-card ui-login-card"
          data-testid="magic-link-totp-form"
          noValidate
        >
          <h1 className="ui-page-title">Подтверждение входа</h1>
          <p className="ui-page-subtitle">
            У вашего аккаунта включена двухфакторная защита. Введите 6-значный код из
            приложения-аутентификатора.
          </p>
          <label htmlFor="magic-totp-code" className="ui-field">
            <span className="ui-field-label">Код</span>
            <input
              id="magic-totp-code"
              className="ui-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
            />
          </label>
          {errorMessage ? (
            <p role="alert" className="ui-error">
              {errorMessage}
            </p>
          ) : null}
          <button className="ui-button ui-button--primary" type="submit" disabled={totpPending}>
            {totpPending ? 'Проверяем...' : 'Подтвердить'}
          </button>
        </form>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="ui-login-center">
        <div
          className="ui-section-card ui-login-card"
          role="alert"
          data-testid="magic-link-redeem-error"
        >
          <h1 className="ui-page-title">Не удалось войти</h1>
          <p className="ui-page-subtitle">{errorMessage}</p>
          <p>
            <Link href="/login" className="ui-button ui-button--primary">
              Запросить новую ссылку
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="ui-login-center">
      <div
        className="ui-section-card ui-login-card"
        role="status"
        aria-live="polite"
        data-testid="magic-link-redeem-pending"
      >
        <h1 className="ui-page-title">Входим...</h1>
        <p className="ui-page-subtitle">Подтверждаем ссылку и открываем ваш аккаунт.</p>
      </div>
    </main>
  );
}
