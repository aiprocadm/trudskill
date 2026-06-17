'use client';

import { type FormEvent, useRef, useState } from 'react';

import { EsiaLoginButton } from './esia-login-button';
import { FieldError, FieldHelp } from '../../components/form-feedback';
import { ApiClientError } from '../../lib/api/client';
import { authApi } from '../../lib/auth/auth-api';
import { frontendEnv } from '../../lib/config/env';

type FormStatus = 'idle' | 'sending' | 'sent';

export const MagicLinkForm = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const emailRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError('Введите адрес электронной почты.');
      emailRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    setError(null);
    setStatus('sending');

    try {
      await authApi.magicLinkRequest({ email: trimmed });
      setStatus('sent');
    } catch (submitError) {
      setStatus('idle');
      setError(
        submitError instanceof ApiClientError
          ? submitError.normalized.message
          : 'Не удалось отправить ссылку для входа. Попробуйте ещё раз.'
      );
    }
  };

  const emailHintId = 'magic-link-email-hint';
  const emailErrorId = 'magic-link-email-error';

  if (status === 'sent') {
    return (
      <div
        className="ui-section-card ui-login-card"
        role="status"
        aria-live="polite"
        data-testid="magic-link-sent"
      >
        <h2 className="ui-page-title">Проверьте почту</h2>
        <p className="ui-page-subtitle">
          Если у нас есть аккаунт на <strong>{email.trim()}</strong>, мы отправили на него ссылку
          для входа. Она действительна 15 минут.
        </p>
        <p className="ui-field-hint">
          Не нашли письмо? Проверьте папку «Спам» или{' '}
          <button
            type="button"
            className="ui-link-button"
            onClick={() => {
              setStatus('idle');
              setError(null);
            }}
          >
            запросите новую ссылку
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="ui-section-card ui-login-card"
      noValidate
      aria-labelledby="magic-link-form-title"
    >
      <h2 id="magic-link-form-title" className="ui-page-title">
        Вход по ссылке на почту
      </h2>
      <p className="ui-page-subtitle">
        Получите одноразовую ссылку — пароль не нужен. Подходит, если вы забыли пароль или входите
        впервые.
      </p>
      <label htmlFor="magic-link-email" className="ui-field">
        <span className="ui-field-label">Электронная почта</span>
        <input
          id="magic-link-email"
          ref={emailRef}
          className="ui-input"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={[emailHintId, fieldError ? emailErrorId : ''].filter(Boolean).join(' ')}
        />
        <FieldHelp id={emailHintId}>
          На этот адрес придёт ссылка для входа, действительная 15 минут.
        </FieldHelp>
        <FieldError id={emailErrorId} message={fieldError} />
      </label>

      {error ? (
        <p role="alert" className="ui-error">
          {error}
        </p>
      ) : null}
      <button
        className="ui-button ui-button--primary"
        type="submit"
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Отправляем...' : 'Отправить ссылку'}
      </button>
      <EsiaLoginButton tenantId={frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID} />
    </form>
  );
};
