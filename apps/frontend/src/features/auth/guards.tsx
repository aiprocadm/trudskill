'use client';

import { LoadingState } from '@cdoprof/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from './context';
import { getRouteBootstrapState } from './use-route-bootstrap';

import type { PropsWithChildren } from 'react';

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading) return;
    const bootstrap = getRouteBootstrapState(pathname, session);
    if (bootstrap.shouldRedirectToLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (bootstrap.shouldRedirectToForbidden) router.replace('/forbidden');
    if (bootstrap.shouldRedirectToNotFound) router.replace('/not-found');
  }, [loading, pathname, router, session]);

  if (loading) return <LoadingState message="Проверяем сессию..." />;
  const bootstrap = getRouteBootstrapState(pathname, session);
  if (bootstrap.access.kind !== 'ok') return <LoadingState message="Перенаправление..." />;
  return <>{children}</>;
};

export const AuthPageGuard = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const { loading, session } = useAuth();

  useEffect(() => {
    if (!loading && session) router.replace('/');
  }, [loading, router, session]);

  if (loading) return <LoadingState message="Проверяем сессию..." />;
  return <>{children}</>;
};
