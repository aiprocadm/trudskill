'use client';

import { createContext, useContext, useId, useRef, useState } from 'react';

import { useOverlayEscapeAndScrollLock, useOverlayFocus } from '../overlay/focus.js';
import { ErrorState, LoadingState } from '../states/index.js';

import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

/**
 * Ревизия 2026-08-27 (порция 34, журнал 288) — «закрытие с проверкой» для содержимого панели.
 *
 * Esc и клик мимо панели спрашивают подтверждение при несохранённых правках, а кнопка
 * «Отмена» внутри формы закрывала напрямую и стирала заполненное молча: подтверждение
 * живёт ВНУТРИ панели, и её содержимому нужен доступ к тому же закрытию.
 *
 * Контекст, а не новый проп: кнопка «Отмена» лежит глубоко в разметке формы, и тащить
 * функцию через все уровни значило бы менять сигнатуры ради одного обработчика.
 */
const DrawerCloseContext = createContext<(() => void) | null>(null);

/**
 * Закрыть панель ТАК ЖЕ, как это делают Esc и клик мимо неё: с подтверждением, если есть
 * несохранённые правки. Вне панели возвращает `null` — вызывающий сам решает, что делать.
 */
export const useDrawerRequestClose = (): (() => void) | null => useContext(DrawerCloseContext);

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
          {!isLoading && !error ? (
            <DrawerCloseContext.Provider value={requestClose}>
              {children}
            </DrawerCloseContext.Provider>
          ) : null}
        </div>

        {footer ? (
          <footer className="ui-drawer__footer">
            <DrawerCloseContext.Provider value={requestClose}>{footer}</DrawerCloseContext.Provider>
          </footer>
        ) : null}

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

/**
 * Кнопка отказа от правок внутри боковой панели (порция 34, журнал 288).
 *
 * Закрывает панель ТЕМ ЖЕ путём, что Esc и клик мимо неё, — то есть с подтверждением,
 * если есть несохранённые правки. Отдельный компонент нужен потому, что кнопка лежит
 * глубоко в разметке формы: хук контекста в теле формы вернул бы `null` (провайдер
 * находится ниже, внутри самой панели).
 *
 * `onFallbackClose` — путь для случая, когда кнопку используют вне панели: тогда
 * подтверждать нечем и закрытие идёт напрямую.
 */
export const DrawerCancelButton = ({
  children = 'Отмена',
  className = 'ui-button',
  disabled = false,
  onFallbackClose
}: {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onFallbackClose?: () => void;
}): ReactElement => {
  const requestClose = useDrawerRequestClose();
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => (requestClose ?? onFallbackClose)?.()}
    >
      {children}
    </button>
  );
};
