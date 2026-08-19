import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSecurityHeadersMiddleware } from './security-headers.js';

/*
 * ФТ-G7 — заголовки обязаны быть на РЕАЛЬНОМ ответе, а не только в чистой функции.
 *
 * Проверка отдельная, потому что здесь ломается то, что не ломается в модульном тесте:
 * порядок подключения (заголовки после маршрутизации в ответ не попадут), ответы об ошибке
 * (401/404 тоже уходят в браузер и тоже должны быть защищены) и запросы, до контроллера
 * не дошедшие вовсе.
 *
 * Приложение поднимается на случайном порту и опрашивается обычным fetch — так устроены
 * остальные HTTP-проверки репозитория (`mvp.http.integration.test.ts`); supertest в
 * зависимостях нет и заводить его ради одного файла не нужно.
 */

let app: { close: () => Promise<void> };
let baseUrl: string;

beforeAll(async () => {
  const [{ NestFactory }, { Controller, Get, Module }] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/common')
  ]);

  @Controller()
  class ProbeController {
    @Get('probe')
    ok() {
      return { ok: true };
    }
  }

  @Module({ controllers: [ProbeController] })
  class ProbeModule {}

  const created = await NestFactory.create(ProbeModule, { logger: false, abortOnError: false });
  // Тот же вызов, что и в main.ts: общая фабрика на боевой код и на тест — иначе проверка
  // разъедется с тем, что реально выставляется, и перестанет что-либо гарантировать.
  created.use(createSecurityHeadersMiddleware(false));
  await created.listen(0, '127.0.0.1');
  const address = created.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  app = created;
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('заголовки безопасности на живом ответе (ФТ-G7)', () => {
  it('успешный ответ несёт политику и запрет угадывания типа', async () => {
    const response = await fetch(`${baseUrl}/probe`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  /*
   * Ответ об ошибке — такой же ответ браузеру. Если бы заголовки ставились в перехватчике
   * успешного ответа, здесь их бы не оказалось, и страница ошибки осталась бы без защиты.
   */
  it('ответ о ненайденном маршруте защищён так же', async () => {
    const response = await fetch(`${baseUrl}/nothing-here`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('в разработке принудительный HTTPS не навязывается', async () => {
    const response = await fetch(`${baseUrl}/probe`);
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });
});
