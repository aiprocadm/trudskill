'use client';

import { useCallback, useEffect } from 'react';

import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const listFocusable = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('data-modal-skip')
  );

/**
 * Ловушка фокуса для всплывающих слоёв.
 *
 * Вынесена из `Modal` в общий модуль при появлении `DetailDrawer` (CMP-010): две копии
 * одной механики разъезжаются — ровно так в приложении и завелись пять независимых дроверов.
 */
export const useOverlayFocus = (panelRef: RefObject<HTMLElement | null>, open: boolean): void => {
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

/** Esc закрывает слой; пока слой открыт, страница под ним не прокручивается. */
export const useOverlayEscapeAndScrollLock = (open: boolean, onClose: () => void): void => {
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
};
