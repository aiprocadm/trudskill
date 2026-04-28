'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useMemo, useRef, useState } from 'react';

import { useAuth } from './context';
import {
  FieldError,
  FieldHelp,
  FormErrorSummary,
  useFocusFirstError
} from '../../components/form-feedback';
import { ApiClientError } from '../../lib/api/client';

export const resolveSafeNextPath = (next: string | null): string => {
  if (!next) {
    return '/';
  }

  const trimmed = next.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }

  return trimmed;
};

export const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ login?: string; password?: string }>({});
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const errors = useMemo(
    () =>
      Object.entries(fieldErrors).map(([field, message]) => ({
        field,
        message: message ?? ''
      })),
    [fieldErrors]
  );

  useFocusFirstError(errors, {
    login: loginRef.current,
    password: passwordRef.current
  });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFieldErrors: typeof fieldErrors = {};
    if (!loginValue.trim()) nextFieldErrors.login = 'Введите логин.';
    if (!password.trim()) nextFieldErrors.password = 'Введите пароль.';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) return;

    setPending(true);
    setError(null);

    try {
      await login(loginValue, password);
      router.replace(resolveSafeNextPath(searchParams.get('next')));
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

  const loginHintId = 'login-hint';
  const loginErrorId = 'login-error';
  const passwordHintId = 'password-hint';
  const passwordErrorId = 'password-error';

  return (
    <div className="ui-login-center">
      <form onSubmit={onSubmit} className="ui-section-card ui-login-card" noValidate>
        <h1 className="ui-page-title">Вход</h1>
        <p className="ui-page-subtitle">Используйте корпоративный логин и пароль.</p>
        <FormErrorSummary
          id="login-form-summary"
          title="Исправьте ошибки во входе"
          errors={errors}
        />
        <label htmlFor="login" className="ui-field">
          <span className="ui-field-label">Логин</span>
          <input
            id="login"
            ref={loginRef}
            className="ui-input"
            name="login"
            required
            value={loginValue}
            onChange={(event) => setLoginValue(event.target.value)}
            aria-invalid={Boolean(fieldErrors.login)}
            aria-describedby={[loginHintId, fieldErrors.login ? loginErrorId : '']
              .filter(Boolean)
              .join(' ')}
          />
          <FieldHelp id={loginHintId}>Формат: корпоративный логин без домена.</FieldHelp>
          <FieldError id={loginErrorId} message={fieldErrors.login} />
        </label>

        <label htmlFor="password" className="ui-field">
          <span className="ui-field-label">Пароль</span>
          <input
            id="password"
            ref={passwordRef}
            className="ui-input"
            name="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={[passwordHintId, fieldErrors.password ? passwordErrorId : '']
              .filter(Boolean)
              .join(' ')}
          />
          <FieldHelp id={passwordHintId}>Минимум 8 символов.</FieldHelp>
          <FieldError id={passwordErrorId} message={fieldErrors.password} />
        </label>

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
