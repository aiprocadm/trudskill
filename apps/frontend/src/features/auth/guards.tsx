'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { LoadingState } from '@cdoprof/ui';
import { useAuth } from './context';
import { evaluateRouteAccess } from '../navigation/helpers';

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading) return;
    const access = evaluateRouteAccess(pathname, session);
    if (access.kind === 'redirect-login') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (access.kind === 'forbidden') router.replace('/forbidden');
    if (access.kind === 'not-found') router.replace('/not-found');
  }, [loading, pathname, router, session]);

  if (loading) return <LoadingState message="Проверяем сессию..." />;
  const access = evaluateRouteAccess(pathname, session);
  if (access.kind !== 'ok') return <LoadingState message="Перенаправление..." />;
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
