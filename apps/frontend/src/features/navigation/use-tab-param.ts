'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { TAB_PARAM, activeTab, tabHref } from './tab-param';

/**
 * Открытая вкладка страницы, привязанная к адресу (`?tab=`), — ТЗ 5.7 (Э7).
 *
 * `replace`, а не `push`: переключение вкладок — это осмотр одной страницы, а не переходы.
 * С `push` кнопка «назад» после осмотра четырёх вкладок нажималась бы четыре раза, чтобы
 * вернуться к списку, откуда пришли.
 *
 * `scroll: false`: человек читает таблицу в середине вкладки, переключает соседнюю и
 * возвращается — прыжок к началу страницы на каждое переключение раздражает без пользы.
 */
export const useTabParam = (
  tabs: readonly string[],
  fallback?: string
): [string, (id: string) => void] => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = activeTab(params.get(TAB_PARAM), tabs, fallback);
  const select = (id: string): void => {
    router.replace(tabHref(pathname, params.toString(), id), { scroll: false });
  };
  return [current, select];
};
