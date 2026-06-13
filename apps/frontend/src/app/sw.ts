/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

// Phase 10 Track C — Serwist service worker (app-shell precache + default runtime caching).
// Compiled by @serwist/next (withSerwist) → public/sw.js. Offline course content is OUT of
// scope; this only precaches the static app shell and applies Serwist's default runtime
// caching strategies. Push handlers are added in a later task.

import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

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

const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache
});

serwist.addEventListeners();
