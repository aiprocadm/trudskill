'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../src/features/auth/context';

export default function LogoutPage() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    logout().finally(() => router.replace('/login'));
  }, [logout, router]);

  return <main style={{ padding: 20 }}>Выход...</main>;
}
