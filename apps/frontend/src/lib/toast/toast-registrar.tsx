'use client';

import { useEffect } from 'react';

import { registerErrorToast, registerSuccessToast } from './global-handlers';
import { useToast } from './toast-provider';

/** Регистрирует глобальные колбэки для мутаций и ошибок вне React-дерева хуков. */
export const ToastRegistrar = () => {
  const { pushSuccess, pushError } = useToast();

  useEffect(() => {
    const unSuccess = registerSuccessToast((title, message) => {
      pushSuccess(title, message);
    });
    const unError = registerErrorToast((title, message) => {
      pushError(title, message);
    });
    return () => {
      unSuccess();
      unError();
    };
  }, [pushSuccess, pushError]);

  return null;
};
