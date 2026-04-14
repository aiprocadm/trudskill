'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '../../src/features/auth/context';

export default function LogoutPage() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    logout().finally(() => router.replace('/login'));
  }, [logout, router]);

  return (
    <main className="ui-centered-page">
      <p className="ui-prose-muted">Выход из системы…</p>
    </main>
  );
}
