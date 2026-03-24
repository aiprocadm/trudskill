'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { LoadingState } from '@cdoprof/ui';
import { useAuth } from './context';
import { getRouteBootstrapState } from './use-route-bootstrap';

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
