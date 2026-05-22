'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { getAvailableRoles } from './role-switcher';
import { useAuth } from '../auth/context';

export const RoleSwitcher = () => {
  const { session } = useAuth();
  const pathname = usePathname();
  const options = getAvailableRoles(session);

  if (options.length < 2) return null;

  return (
    <nav className="ui-inline" aria-label="Переключение между кабинетами" style={{ gap: 8 }}>
      {options.map((option) => {
        const isActive = pathname === option.href || pathname?.startsWith(`${option.href}/`);
        return (
          <Link
            key={option.code}
            href={option.href}
            aria-current={isActive ? 'page' : undefined}
            className={`ui-tab ${isActive ? 'ui-tab--active' : ''}`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
};
