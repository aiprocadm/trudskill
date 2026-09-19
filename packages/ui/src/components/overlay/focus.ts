'use client';

import { useCallback, useEffect, useRef } from 'react';

import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Куда вернуть фокус, когда всплывающий слой закрылся (ТЗ 14.1, пункт 1).
 *
 * Правило вынесено отдельно, потому что у него ровно один неочевидный случай: кнопки-источника
 * может уже не быть на странице. Так бывает, когда действие в слое удалило ту самую строку, из
 * которой слой открыли. Возвращать фокус в пустоту нельзя — браузер отправит его на начало
 * страницы, то есть ровно туда, откуда мы пытаемся человека увести. Не трогать чужой фокус в
 * таком случае честнее: человек уже мог перейти дальше сам.
 */
export const focusReturnTarget = (saved: HTMLElement | null | undefined): HTMLElement | null => {
  if (!saved) return null;
  if (!saved.isConnected) return null;
  if (typeof saved.focus !== 'function') return null;
  return saved;
};

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
  /*
   * ТЗ 14.1 (пункт 1): куда денется фокус, когда слой закроется.
   *
   * Раньше — никуда: он оставался на исчезнувшем элементе и падал на начало страницы. Для
   * человека с мышью это незаметно, а тот, кто работает с клавиатуры, терял место. Открыл
   * карточку из сороковой строки таблицы, закрыл — и чтобы вернуться к той же строке, надо
   * сорок раз нажать Tab. На каждой такой операции (журнал 569).
   *
   * Запоминаем, откуда пришли, и возвращаем фокус туда же. Проверка `isConnected` — на случай,
   * когда кнопки-источника уже нет на странице: строку удалили этим же действием. Тогда
   * возвращать некуда, и трогать чужой фокус нельзя — человек уже мог уйти дальше сам.
   */
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    return () => {
      const target = focusReturnTarget(returnTo.current);
      returnTo.current = null;
      target?.focus();
    };
  }, [open]);

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
