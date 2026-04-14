'use client';

import {
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef
} from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const listFocusable = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('data-modal-skip')
  );

const useModalFocus = (panelRef: RefObject<HTMLElement | null>, open: boolean) => {
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const root = panelRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = listFocusable(root);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKeyDown);
    const items = listFocusable(root);
    (items[0] ?? root).focus();
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [open, panelRef]);
};

export const Modal = ({
  open,
  title,
  onClose,
  children
}: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `ui-modal-title-${useId().replace(/:/g, '')}`;

  useModalFocus(panelRef, open);

  const onEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', onEscape);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onEscape]);

  if (!open) return null;

  return (
    <div className="ui-modal-root" role="presentation">
      <div className="ui-modal-backdrop" role="presentation" aria-hidden onClick={onClose} />
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

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
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
        className="ui-button ui-button--primary"
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
