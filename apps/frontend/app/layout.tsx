import { Golos_Text, PT_Serif } from 'next/font/google';

import { AppProviders } from '../src/app/providers';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Phase 10 Track C — PWA metadata. The web app manifest itself lives in app/manifest.ts
// (App Router metadata route) and is linked automatically; here we add the theme colour and
// iOS standalone hints so the installed app chrome matches the brand.
export const metadata: Metadata = {
  applicationName: 'CDOProf',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CDOProf' }
};

export const viewport: Viewport = {
  themeColor: '#0b5cab'
};

// Golos Text — функциональный UI/текст. PT Serif — акцент (вордмарк, герой-заголовок).
// Обе Paratype, кириллица-first. next/font self-hosts шрифты в бандл (end-user не ходит в Google → 152-ФЗ).
const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-golos',
  fallback: ['Segoe UI', 'system-ui', 'Arial', 'sans-serif']
});

const ptSerif = PT_Serif({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-serif',
  fallback: ['Georgia', 'Times New Roman', 'serif']
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${ptSerif.variable}`}>
      <body style={{ margin: 0, fontFamily: 'var(--font-golos), Segoe UI, system-ui, sans-serif' }}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
