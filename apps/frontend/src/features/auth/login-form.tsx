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
      if (submitError instanceof ApiClientError) {
        setError(submitError.normalized.message);
      } else {
        setError('Не удалось войти в систему');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, width: 320 }}>
      <h1>Вход</h1>
      <FormField label="Логин" name="login" required />
      <FormField label="Пароль" name="password" type="password" required />
      {error ? <p role="alert">{error}</p> : null}
      <button className="ui-button ui-button--primary" type="submit" disabled={pending}>
        {pending ? 'Входим...' : 'Войти'}
      </button>
    </form>
  );
};
