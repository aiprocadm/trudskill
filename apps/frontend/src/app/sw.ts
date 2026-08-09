/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

// Phase 10 Track C — Serwist service worker (app-shell precache + default runtime caching).
// Compiled by @serwist/next (withSerwist) → public/sw.js. Offline course content is OUT of
// scope; this only precaches the static app shell and applies Serwist's default runtime
// caching strategies. Push handlers are added in a later task.

import { defaultCache } from '@serwist/next/worker';
import { NetworkOnly, Serwist } from 'serwist';

import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by Serwist at build time via withSerwist.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Serwist's injector requires exactly ONE textual occurrence of `self.__SW_MANIFEST`, so read it
// into a local once. exactOptionalPropertyTypes: precacheEntries must not be literally `undefined`,
// so default to an empty array (absent manifest → no precache; runtime caching still applies).
const precacheEntries = self.__SW_MANIFEST ?? [];

/**
 * Ответы API НИКОГДА не кладём в кэш (ФТ-H6, Фаза 6 Task 11).
 *
 * ЗАЧЕМ. Это не косметика, а утечка. Стандартные правила Serwist складывают ответы в
 * Cache Storage, который живёт в браузере ПОСЛЕ выхода из системы. На общем компьютере
 * учебного класса — а это самый обычный случай для учебного центра — следующий человек
 * открывал бы страницу и видел списки, ФИО и оценки предыдущего.
 *
 * Правило стоит ПЕРВЫМ: правила проверяются по порядку, и любое кэширующее правило после
 * него до запросов к API уже не доберётся.
 */
const API_NEVER_CACHED = {
  matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => {
    // Свой origin: путь API. Чужой origin: бэкенд стоит на отдельном адресе, поэтому
    // ориентируемся на путь, а не на хост — адрес бэкенда задаётся при сборке.
    if (url.pathname.startsWith('/api/')) return true;
    // Всё, что уходит на другой origin, тоже не кэшируем: единственный чужой origin у нас —
    // это как раз бэкенд и realtime.
    return !sameOrigin;
  },
  handler: new NetworkOnly()
};

const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [API_NEVER_CACHED, ...defaultCache],
  fallbacks: {
    entries: [
      {
        // Без этого при обрыве связи человек видит стандартную ошибку браузера и не
        // понимает, что случилось: сломался сайт или пропал интернет.
        url: '/offline',
        matcher: ({ request }: { request: Request }) => request.destination === 'document'
      }
    ]
  }
});

serwist.addEventListeners();

/**
 * Очистка кэша при выходе (ФТ-H6, Фаза 6 Task 11).
 *
 * Выход из системы должен уносить с собой ВСЁ, что браузер успел запомнить. Страница
 * присылает сюда сообщение при выходе; мы стираем все хранилища кэша целиком — включая
 * предзагруженную оболочку приложения, она восстановится сама при следующем открытии.
 */
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type !== 'CLEAR_CACHES') {
    return;
  }
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    })()
  );
});

// Phase 10 Track C — web-push handlers. Payload shape matches WebPushSender's JSON
// ({ title, body, url }). Show the notification; on click, focus/open the deep-link.
self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {};
    } catch {
      return {};
    }
  })() as { title?: string; body?: string; url?: string };

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'trudskill', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});
