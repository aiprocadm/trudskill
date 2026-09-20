'use client';

import { useConfirmDialog } from '@trudskill/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import {
  LEAVE_CONFIRM_CANCEL,
  LEAVE_CONFIRM_MESSAGE,
  LEAVE_CONFIRM_OK,
  LEAVE_CONFIRM_TITLE,
  leadsAwayFromForm,
  shouldGuardLeave
} from '../lib/forms/leave-guard';

import type { ReactElement } from 'react';

/**
 * Единый механизм «грязной формы» для СТРАНИЦ (ТЗ «Стабилизация, UX и развитие», 10.3).
 *
 * Боковая панель спрашивает подтверждение сама (`CMP-010`), а страница — не спрашивала
 * никто: механизма для неё не существовало. Человек набирал карточку, промахивался по пункту
 * меню и терял работу молча (журнал 591).
 *
 * **Одна строка на экран — это условие того, что механизм приживётся.** Если бы каждому
 * экрану пришлось держать своё состояние диалога и свой обработчик, первый же новый экран
 * забыл бы про защиту — ровно так и вышло с признаком `hasUnsavedChanges` у панелей, где
 * семь форм его не передавали.
 *
 *     <UnsavedChangesGuard dirty={isFormDirty(form, initial)} saving={saving} />
 *
 * **Две половины ухода, и они разные.** Закрытие вкладки перехватывает браузер
 * (`beforeunload`) — своим окном, которое мы не оформляем и не переводим. Переход внутри
 * приложения браузер не видит вовсе: это подмена адреса без перезагрузки, и её надо ловить
 * самим — на клике по ссылке, до того, как за него возьмётся `Link`.
 */
export const UnsavedChangesGuard = ({
  dirty,
  saving
}: {
  dirty: boolean;
  saving?: boolean;
}): ReactElement | null => {
  const router = useRouter();
  const pathname = usePathname();
  const { ask, dialog } = useConfirmDialog();
  const active = shouldGuardLeave({ dirty, ...(saving === undefined ? {} : { saving }) });

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent): void => {
      /*
       * Браузер покажет своё окно и своим текстом — задать его нельзя уже много лет. Это не
       * недоработка: иначе страницы удерживали бы человека выдуманными угрозами.
       */
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute('href') ?? '';
      const away = leadsAwayFromForm({
        href,
        currentPath: pathname ?? '',
        target: anchor.getAttribute('target'),
        hasDownload: anchor.hasAttribute('download'),
        /*
         * Ctrl / Cmd / Shift / средняя кнопка открывают новую вкладку — страница с формой
         * остаётся на месте, и спрашивать не о чем.
         */
        opensNewTab:
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
      });
      if (!away) return;

      /*
       * Перехват идёт на «погружении» (`capture`): обработчик `Link` висит на самой ссылке,
       * и к моменту всплытия переход уже начался.
       */
      event.preventDefault();
      event.stopPropagation();
      ask(
        {
          title: LEAVE_CONFIRM_TITLE,
          message: LEAVE_CONFIRM_MESSAGE,
          confirmLabel: LEAVE_CONFIRM_OK,
          cancelLabel: LEAVE_CONFIRM_CANCEL
        },
        () => router.push(href)
      );
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, pathname, ask, router]);

  return dialog;
};
