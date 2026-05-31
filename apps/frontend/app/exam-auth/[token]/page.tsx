'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../src/features/auth/context';
import { testPlayerApi } from '../../../src/features/test-player/api';
import { ApiClientError } from '../../../src/lib/api/client';

type VerifyStatus = 'pending' | 'ok' | 'error';

export default function ExamAuthPage() {
  const params = useParams<{ token: string | string[] }>();
  const { session } = useAuth();
  const [status, setStatus] = useState<VerifyStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const consumedRef = useRef(false);

  const rawTokenParam = params?.token;
  const token = Array.isArray(rawTokenParam) ? rawTokenParam[0] : rawTokenParam;

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Ссылка для подтверждения повреждена или неполная.');
      return;
    }

    if (!session) return;

    if (consumedRef.current) return;
    consumedRef.current = true;

    let cancelled = false;
    testPlayerApi
      .verifyPreExamToken(session, token)
      .then(() => {
        if (cancelled) return;
        setStatus('ok');
      })
      .catch((verifyError: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          verifyError instanceof ApiClientError
            ? verifyError.normalized.message
            : 'Не удалось подтвердить личность. Ссылка недействительна или истекла.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [session, token]);

  if (status === 'ok') {
    return (
      <main className="ui-login-center">
        <div className="ui-section-card ui-login-card" role="status" data-testid="exam-auth-ok">
          <h1 className="ui-page-title">Личность подтверждена</h1>
          <p className="ui-page-subtitle">Вернитесь к списку тестов и начните экзамен.</p>
          <p>
            <Link href="/learner/tests" className="ui-button ui-button--primary">
              Мои тесты
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="ui-login-center">
        <div className="ui-section-card ui-login-card" role="alert" data-testid="exam-auth-error">
          <h1 className="ui-page-title">Не удалось подтвердить личность</h1>
          <p className="ui-page-subtitle">{errorMessage}</p>
          <p>
            <Link href="/learner/tests" className="ui-button ui-button--primary">
              Вернуться к тестам
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
        data-testid="exam-auth-pending"
      >
        <h1 className="ui-page-title">Подтверждаем личность…</h1>
        <p className="ui-page-subtitle">Проверяем ссылку и подтверждаем вашу личность.</p>
      </div>
    </main>
  );
}
