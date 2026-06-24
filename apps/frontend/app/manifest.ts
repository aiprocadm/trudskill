import type { MetadataRoute } from 'next';

/**
 * Phase 10 Track C — PWA web app manifest (App Router metadata route → /manifest.webmanifest).
 * Makes the личный кабинет installable. Icons are solid-color placeholders (see
 * public/icons/README.md) — replace with real brand assets before a public release.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'trudskill — Личный кабинет',
    short_name: 'trudskill',
    description: 'Платформа дистанционного обучения trudskill',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b4fe4',
    lang: 'ru',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
