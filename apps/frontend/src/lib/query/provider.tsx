'use client';

import type { PropsWithChildren } from 'react';

export const AppQueryProvider = ({ children }: PropsWithChildren) => <>{children}</>;

export interface QueryPolicy {
  dedupe: true;
  safeRetryCount: number;
  authSensitiveRetry: false;
}

export const defaultQueryPolicy: QueryPolicy = {
  dedupe: true,
  safeRetryCount: 2,
  authSensitiveRetry: false
};
