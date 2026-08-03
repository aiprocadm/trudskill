'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { brandingApi } from './api';
import { brandingToThemeVars } from './theme';
import { useAuth } from '../auth/context';

import type { TenantBrandingDto } from './theme';
import type { CSSProperties, PropsWithChildren, ReactElement } from 'react';

/**
 * ФТ-D3.1: бренд тенанта раздаётся одним запросом на сессию — его читают и
 * тема-обёртка, и шапка. Без сессии (логин, публичные страницы) бренда нет,
 * всё красится темой по умолчанию. Ошибка загрузки бренда не мешает работать:
 * тема просто остаётся дефолтной.
 */

const TenantBrandingContext = createContext<TenantBrandingDto>({});

export const useTenantBranding = (): TenantBrandingDto => useContext(TenantBrandingContext);

export const TenantBrandingProvider = ({ children }: PropsWithChildren): ReactElement => {
  const { session } = useAuth();
  // Ошибка запроса не мешает работать: нет бренда — есть дефолтная тема.
  const brandingQuery = useQuery({
    queryKey: ['tenant-branding', session?.user.tenantId],
    enabled: Boolean(session),
    queryFn: () => brandingApi.get(session!)
  });

  const branding = brandingQuery.data?.branding ?? {};
  const vars = brandingToThemeVars(branding);
  const themed = Object.keys(vars).length > 0;

  return (
    <TenantBrandingContext.Provider value={branding}>
      {themed ? (
        <div style={vars as CSSProperties} className="tenant-theme-scope">
          {children}
        </div>
      ) : (
        children
      )}
    </TenantBrandingContext.Provider>
  );
};
