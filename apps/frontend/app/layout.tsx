import { Inter } from 'next/font/google';

import { AppProviders } from '../src/app/providers';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Phase 10 Track C — PWA metadata. The web app manifest itself lives in app/manifest.ts
// (App Router metadata route) and is linked automatically; here we add the theme colour and
// iOS standalone hints so the installed app chrome matches the brand.
export const metadata: Metadata = {
  applicationName: 'trudskill',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'trudskill' }
};

export const viewport: Viewport = {
  themeColor: '#3b4fe4'
};

// Inter — единый современный гротеск для всего интерфейса и для вордмарка.
// Кириллица + латиница. next/font self-hosts шрифт в бандл (end-user не ходит в Google → 152-ФЗ).
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans',
  fallback: ['Segoe UI', 'system-ui', 'Arial', 'sans-serif']
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body style={{ margin: 0, fontFamily: 'var(--font-sans), Segoe UI, system-ui, sans-serif' }}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
