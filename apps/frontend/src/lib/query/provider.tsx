'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type PropsWithChildren, useState } from 'react';

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

export const AppQueryProvider = ({ children }: PropsWithChildren) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: defaultQueryPolicy.safeRetryCount
          }
        }
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
