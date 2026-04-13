'use client';

import { FormField } from '@cdoprof/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { useAuth } from './context';
import { ApiClientError } from '../../lib/api/client';

export const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const loginValue = String(formData.get('login') ?? '');
    const password = String(formData.get('password') ?? '');
    setPending(true);
    setError(null);

    try {
      await login(loginValue, password);
      router.replace(searchParams.get('next') ?? '/');
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.normalized.message
          : 'Не удалось войти в систему'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="ui-login-center">
      <form onSubmit={onSubmit} className="ui-section-card ui-login-card">
        <h1 className="ui-page-title">Вход</h1>
        <p className="ui-page-subtitle">Используйте корпоративный логин и пароль.</p>
        <FormField label="Логин" name="login" required />
        <FormField label="Пароль" name="password" type="password" required />
        {error ? (
          <p role="alert" className="ui-error">
            {error}
          </p>
        ) : null}
        <button className="ui-button ui-button--primary" type="submit" disabled={pending}>
          {pending ? 'Входим...' : 'Войти'}
        </button>
      </form>
    </div>
  );
};
