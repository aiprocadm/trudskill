'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../../src/features/auth/context';
import { resolveSafeNextPath } from '../../../../src/features/auth/login-form';
import { ApiClientError } from '../../../../src/lib/api/client';

type RedeemStatus = 'pending' | 'error';

export default function MagicLinkRedeemPage() {
  const params = useParams<{ token: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithMagicLink } = useAuth();
  const [status, setStatus] = useState<RedeemStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      .then(() => {
        if (cancelled) return;
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
