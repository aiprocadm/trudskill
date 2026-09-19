'use client';

import { BootSplash } from '@trudskill/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from './context';
import { resolveNextTarget } from './next-target';
import { getRouteBootstrapState } from './use-route-bootstrap';

import type { PropsWithChildren } from 'react';

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const pathname = usePathname();
  // Половина полезных адресов СДО — списки с фильтрами (`/groups?status=active&page=2`).
  // Без строки запроса человек после входа попадал на голый список и терял, что искал.
  const searchParams = useSearchParams();
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading) return;
    const bootstrap = getRouteBootstrapState(pathname, session);
    if (bootstrap.shouldRedirectToLogin) {
      const query = searchParams?.toString() ?? '';
      const target = query ? `${pathname}?${query}` : pathname;
      router.replace(`/login?next=${encodeURIComponent(target)}`);
    }
    if (bootstrap.shouldRedirectToForbidden) router.replace('/forbidden');
    if (bootstrap.shouldRedirectToNotFound) router.replace('/not-found');
  }, [loading, pathname, router, searchParams, session]);

  /*
   * ТЗ 7.3: пока едет сессия, человек видит КАРКАС будущей страницы, а не серую надпись в
   * углу пустого листа. Он уже здесь, просто страница ещё не наполнилась (журнал 564).
   */
  if (loading) return <BootSplash />;
  const bootstrap = getRouteBootstrapState(pathname, session);
  /*
   * Уводим на другой адрес: каркас рисовать нечестно — этой страницы человек не увидит.
   * Сообщение говорит, что происходит, а не «Перенаправление...» техническим словом.
   */
  if (bootstrap.access.kind !== 'ok')
    return <BootSplash frame="plain" message="Открываем нужный раздел" />;
  return <>{children}</>;
};

/** Куда высаживать вошедшего, когда осмысленного `next` нет. */
const DEFAULT_LANDING = '/';

export const AuthPageGuard = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, session } = useAuth();
  const next = searchParams?.get('next') ?? null;

  // `ProtectedRoute` уводит анонима на `/login?next=<куда он шёл>`, но раньше этот адрес
  // никто не читал: вход всегда высаживал на «/», и ссылки из писем и закладок не доводили
  // до цели. Теперь ведём по `next`, но только если он безопасен (см. `next-target.ts`:
  // чужая строка, попавшая в адрес перехода, — это открытый редирект).
  //
  // Запасной вариант намеренно остаётся «/», а не домашним маршрутом роли: его считает
  // корневая страница (`resolveRoleHome`), и дублировать это решение здесь значило бы
  // завести второй источник правды, который однажды разойдётся с первым.
  useEffect(() => {
    if (loading || !session) return;
    router.replace(resolveNextTarget(next, DEFAULT_LANDING));
  }, [loading, next, router, session]);

  /* Страница входа: каркаса приложения здесь не будет, поэтому только знак и подпись. */
  if (loading) return <BootSplash frame="plain" message="Проверяем, вошли ли вы" />;
  return <>{children}</>;
};
