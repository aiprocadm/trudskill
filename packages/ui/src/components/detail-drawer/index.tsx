'use client';

import { useId, useRef, useState } from 'react';

import { useOverlayEscapeAndScrollLock, useOverlayFocus } from '../overlay/focus.js';
import { ErrorState, LoadingState } from '../states/index.js';

import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

/**
 * Боковая панель деталей (CMP-010).
 *
 * Не новый компонент, а обобщение восьми существующих: пяти дроверов
 * (`learner-edit`, `client-edit`, `question-editor`, `assignment-edit`, `question-bank-edit`)
 * и трёх модалок того же назначения. Служит бюджету «≤3 клика»: объект смотрят и правят,
 * не уходя с реестра.
 *
 * Ловушка фокуса и Esc берутся из общего модуля overlay — той же механикой пользуется `Modal`.
 */
export const DetailDrawer = ({
  open,
  onClose,
  title,
  subtitle,
  width = 'md',
  footer,
  isLoading = false,
  error,
  onRetry,
  hasUnsavedChanges = false,
  children
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Закрытие с несохранёнными правками требует подтверждения — иначе работа теряется молча. */
  hasUnsavedChanges?: boolean;
}>): ReactElement | null => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `ui-drawer-title-${useId().replace(/:/g, '')}`;
  const [confirmingClose, setConfirmingClose] = useState(false);

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  };

  useOverlayFocus(panelRef, open);
  useOverlayEscapeAndScrollLock(open, requestClose);

  if (!open) return null;

  return (
    <div className="ui-drawer-root" role="presentation">
      <div className="ui-drawer-backdrop" role="presentation" aria-hidden onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`ui-drawer ui-drawer--${width}`}
        tabIndex={-1}
      >
        <header className="ui-drawer__header">
          <div>
            <h2 id={titleId} className="ui-drawer__title">
              {title}
            </h2>
            {subtitle ? <p className="ui-drawer__subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="ui-button-link"
            onClick={requestClose}
            aria-label="Закрыть панель"
          >
            Закрыть
          </button>
        </header>

        <div className="ui-drawer__body">
          {isLoading ? <LoadingState /> : null}
          {!isLoading && error ? (
            <div className="ui-stack">
              <ErrorState />
              {onRetry ? (
                <button type="button" className="ui-button-secondary" onClick={onRetry}>
                  Повторить
                </button>
              ) : null}
            </div>
          ) : null}
          {!isLoading && !error ? children : null}
        </div>

        {footer ? <footer className="ui-drawer__footer">{footer}</footer> : null}

        {confirmingClose ? (
          <div
            className="ui-drawer__confirm"
            role="alertdialog"
            aria-label="Закрыть без сохранения"
          >
            <p>Изменения не сохранены. Закрыть панель и потерять их?</p>
            <div className="ui-inline">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => setConfirmingClose(false)}
              >
                Вернуться к правкам
              </button>
              <button type="button" className="ui-button-danger" onClick={onClose}>
                Закрыть без сохранения
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
