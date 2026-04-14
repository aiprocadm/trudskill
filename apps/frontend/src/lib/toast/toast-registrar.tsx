'use client';

import { useEffect } from 'react';

import { registerErrorToast, registerSuccessToast } from './global-handlers';
import { useToast } from './toast-provider';

/** Регистрирует глобальные колбэки для мутаций и ошибок вне React-дерева хуков. */
export const ToastRegistrar = () => {
  const { pushToast } = useToast();

  useEffect(() => {
    const unSuccess = registerSuccessToast((title, message) => {
      pushToast({ variant: 'success', title, ...(message ? { message } : {}) });
    });
    const unError = registerErrorToast((title, message) => {
      pushToast({ variant: 'error', title, ...(message ? { message } : {}) });
    });
    return () => {
      unSuccess();
      unError();
    };
  }, [pushToast]);

  return null;
};
