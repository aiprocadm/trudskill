/**
 * Сторож PWA (ФТ-H6, Фаза 6 Task 11).
 *
 * Дом не монтирует React в тестах и не поднимает service worker, поэтому свойства
 * закрепляются по исходникам. Каждое куплено конкретной бедой:
 *
 *  1. Ответы API попадали в Cache Storage, который переживает выход из системы. На общем
 *     компьютере учебного класса следующий человек увидел бы списки, ФИО и оценки
 *     предыдущего.
 *  2. Страница сама перезагружалась при возврате сети. У слушателя моргнул Wi-Fi посреди
 *     экзамена — и попытка перезагрузилась с потерей несохранённых ответов.
 *  3. При обрыве связи человек видел ошибку браузера и не понимал, сломалась система или
 *     пропал интернет.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string): string => readFileSync(join(frontendRoot, relative), 'utf8');

describe('service worker не хранит чужие данные', () => {
  const sw = read('src/app/sw.ts');

  it('запросы к API обрабатываются БЕЗ кэша', () => {
    expect(sw).toContain('NetworkOnly');
    expect(sw).toContain('API_NEVER_CACHED');
  });

  it('правило «не кэшировать API» стоит ПЕРВЫМ — иначе до него не дойдёт очередь', () => {
    expect(sw).toContain('runtimeCaching: [API_NEVER_CACHED, ...defaultCache]');
  });

  it('чужой origin (бэкенд и realtime) тоже не кэшируется', () => {
    expect(sw).toContain('!sameOrigin');
  });

  it('есть очистка кэша по сообщению от страницы', () => {
    expect(sw).toContain("data?.type !== 'CLEAR_CACHES'");
    expect(sw).toContain('caches.delete');
  });
});

describe('выход уносит кэш', () => {
  const context = read('src/features/auth/context.tsx');

  it('при выходе кэш браузера чистится', () => {
    expect(context).toContain('clearBrowserCaches');
    expect(context).toContain('caches.delete');
  });

  it('чистка идёт ПОСЛЕ выхода и не мешает ему при ошибке', () => {
    const logoutBlock = context.slice(context.indexOf('logout: async'));
    expect(logoutBlock.indexOf('sessionManager.logout')).toBeLessThan(
      logoutBlock.indexOf('clearBrowserCaches')
    );
    // Ошибка уборки не должна мешать человеку выйти.
    expect(context).toContain('} catch {');
  });

  it('service worker тоже получает команду почистить свои файлы', () => {
    expect(context).toContain("postMessage({ type: 'CLEAR_CACHES' })");
  });
});

describe('экзамен не прерывается сам', () => {
  it('автоперезагрузка при возврате сети выключена', () => {
    const config = read('next.config.ts');
    expect(config).toContain('reloadOnOnline: false');
  });
});

describe('обрыв связи объясняется человеку', () => {
  it('есть страница «нет интернета»', () => {
    const page = read('app/offline/page.tsx');
    expect(page).toContain('Нет связи с интернетом');
  });

  it('service worker показывает её вместо ошибки браузера', () => {
    const sw = read('src/app/sw.ts');
    expect(sw).toContain("url: '/offline'");
    expect(sw).toContain("request.destination === 'document'");
  });

  it('страница честно предупреждает, что не обновится сама', () => {
    // Иначе слушатель будет ждать автообновления и решит, что всё зависло.
    const page = read('app/offline/page.tsx');
    expect(page).toContain('не обновится сама');
  });
});
