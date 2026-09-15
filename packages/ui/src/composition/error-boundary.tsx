'use client';

import { Component } from 'react';

import type { ErrorInfo, ReactNode } from 'react';

/**
 * Перехватчик падений на уровне содержимого страницы (ТЗ «Стабилизация, UX и развитие», 1.1.4).
 *
 * Зачем. В проекте не было НИ ОДНОГО перехватчика: исключение при отрисовке любого блока
 * уносило страницу целиком в `app/error.tsx` — вместе с меню, крошками и выходом. Человек
 * оставался на голом экране, откуда некуда идти, и это ровно то, что в ТЗ описано как
 * «человек выпадает из системы».
 *
 * Здесь падает только СВОЙ блок: оболочка живёт выше и остаётся рабочей. Текст исключения в
 * лицо не показывается (правило продукта №4 — технический код под спойлером); наружу он
 * уходит подписчикам, чтобы попасть в сбор ошибок (15.1).
 */

type RenderErrorListener = (error: unknown, info?: ErrorInfo) => void;

const renderErrorListeners = new Set<RenderErrorListener>();

/** Подписка на падения отрисовки — точка присоединения сбора ошибок (ТЗ 15.1). */
export const subscribeRenderErrors = (listener: RenderErrorListener): (() => void) => {
  renderErrorListeners.add(listener);
  return () => {
    renderErrorListeners.delete(listener);
  };
};

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Чем подписать блок, чтобы человек понял, ЧТО именно не показалось. */
  what?: string;
}

interface ErrorBoundaryState {
  error: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info?: ErrorInfo): void {
    renderErrorListeners.forEach((listener) => {
      try {
        listener(error, info);
      } catch {
        /* подписчик сбора ошибок не должен ронять перехватчик */
      }
    });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const what = this.props.what ? ` (${this.props.what})` : '';
    return (
      <div className="ui-callout ui-callout--warning" role="alert">
        <p>
          <strong>Этот блок не удалось показать{what}.</strong> Остальная страница работает — меню и
          выход на месте. Если повтор не помогает, обновите страницу или вернитесь позже.
        </p>
        <button type="button" className="ui-button" onClick={() => this.setState({ error: null })}>
          Повторить
        </button>
      </div>
    );
  }
}
