'use client';

import { type PropsWithChildren, useId, useRef } from 'react';

import { useOverlayEscapeAndScrollLock, useOverlayFocus } from '../overlay/focus.js';

// Ловушка фокуса и Esc переехали в ../overlay/focus.js при появлении DetailDrawer (CMP-010):
// две копии одной механики неизбежно разъезжаются.

export const Modal = ({
  open,
  title,
  onClose,
  children
}: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `ui-modal-title-${useId().replace(/:/g, '')}`;

  useOverlayFocus(panelRef, open);
  useOverlayEscapeAndScrollLock(open, onClose);

  if (!open) return null;

  return (
    <div className="ui-modal-root" role="presentation">
      <div className="ui-modal-backdrop" role="presentation" aria-hidden onClick={onClose} />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- Phase 10B: out-of-scope; onClick only stops backdrop-propagation, dialog already has focus trap + Escape handler (keyboard-accessible). Modal landmarks intentionally untouched per plan. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ui-modal-panel"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="ui-modal-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
};

export const Dialog = ({
  title,
  children,
  open,
  onClose
}: PropsWithChildren<{ title: string; open: boolean; onClose: () => void }>) => (
  <Modal open={open} title={title} onClose={onClose}>
    {children}
  </Modal>
);

/**
 * Подтверждение опасного действия (CMP-005).
 *
 * `tone: 'danger'` красит кнопку подтверждения в цвет опасности. Это не украшение:
 * в браузерном `confirm()` обе кнопки выглядели одинаково, и «Удалить» ничем не
 * отличалось от «Сохранить» — человек подтверждал на автомате.
 */
export const ConfirmDialog = ({
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  tone = 'default',
  onConfirm,
  onCancel
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <Modal open title={title} onClose={onCancel}>
    {message ? (
      <p className="ui-system-text" style={{ textAlign: 'left', marginBottom: 0 }}>
        {message}
      </p>
    ) : null}
    <div className="ui-modal-actions">
      <button type="button" className="ui-button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button
        type="button"
        className={
          tone === 'danger' ? 'ui-button ui-button-danger' : 'ui-button ui-button--primary'
        }
        onClick={() => {
          onConfirm();
          onCancel();
        }}
      >
        {confirmLabel}
      </button>
    </div>
  </Modal>
);
