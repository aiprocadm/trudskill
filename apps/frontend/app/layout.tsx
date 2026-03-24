import type { ReactNode } from 'react';
import { AppProviders } from '../src/app/providers';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: 'Inter, sans-serif' }}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
