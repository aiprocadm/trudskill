'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { type ObjectCrumb, publishObjectCrumb, retractObjectCrumb } from './object-crumb';

/**
 * Экран карточки называет свой объект для хлебных крошек (ТЗ 3.5 / Н5).
 *
 * Вызывается один раз на верхнем уровне экрана, ДО ранних `return`, — как любой хук:
 *
 *   useObjectCrumb(group?.name, { notFound, failed: Boolean(error) });
 *
 * Пока имени нет и признаков отказа нет — крошка рисуется скелетоном. Экран не обязан помнить
 * про «загружается»: это состояние по умолчанию. При уходе с экрана имя снимается само.
 */
export const useObjectCrumb = (
  name: string | null | undefined,
  options: { notFound?: boolean; failed?: boolean } = {}
): void => {
  const pathname = usePathname();
  const notFound = options.notFound === true;
  const failed = options.failed === true;

  useEffect(() => {
    const crumb: ObjectCrumb = name
      ? { status: 'ready', name }
      : notFound
        ? { status: 'missing' }
        : failed
          ? { status: 'failed' }
          : { status: 'loading' };
    publishObjectCrumb(pathname, crumb);
    return () => retractObjectCrumb(pathname);
  }, [pathname, name, notFound, failed]);
};
