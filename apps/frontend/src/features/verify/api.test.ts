import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { fetchVerifyDocument as FetchVerifyDocumentType } from './api';

/**
 * Публичная проверка документа: сообщение читает не разработчик, а проверяющий с телефона —
 * он отсканировал QR на удостоверении и хочет знать, годен документ или нет.
 *
 * Прежде при отказе сервера на экран выводилось «Verify failed: HTTP 500»: английская строка
 * с кодом состояния, запрещённая правилом продукта (`TXT-004` — сказать, что случилось и что
 * делать). Увидели это, обойдя все страницы браузером.
 */
describe('сообщение об отказе публичной проверки', () => {
  let fetchVerifyDocument: typeof FetchVerifyDocumentType;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    fetchVerifyDocument = (await import('./api')).fetchVerifyDocument;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('сбой сервера объясняется по-русски и без кода состояния', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    await expect(fetchVerifyDocument('token1234567890')).rejects.toThrow(
      /Не удалось проверить документ/
    );
    await expect(fetchVerifyDocument('token1234567890')).rejects.not.toThrow(/HTTP|failed/i);
  });

  it('неизвестный код — это не ошибка, а «не найден»', async () => {
    /* Страница показывает «документ не найден»; отказ сервера тут был бы враньём. */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(fetchVerifyDocument('token1234567890')).resolves.toBeNull();
  });
});
