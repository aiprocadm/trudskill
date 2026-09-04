import { describe, expect, it } from 'vitest';

import { controllerHandlers } from './controller-inventory.test-util.js';

/**
 * Инвентарь обработчиков — сам под присмотром: сторожа прав верят его маршрутам, и
 * неверный адрес в инвентаре превращает поимённое исключение (`EXEMPT`) или фильтр
 * по адресу (`REGISTRY_ROUTE`) в проверку не той ручки.
 */
describe('инвентарь обработчиков', () => {
  it('в файле с несколькими контроллерами префикс берётся у СВОЕГО класса', () => {
    // integrations.controller.ts: три класса — `integrations`, `exports`, `sync-logs`.
    // Первая версия брала первый `@Controller(...)` файла для всех и называла
    // `GET /sync-logs` «GET /integrations».
    const routes = new Set(controllerHandlers().map((h) => h.route));
    expect(routes.has('GET /exports/tasks')).toBe(true);
    expect(routes.has('GET /sync-logs')).toBe(true);
    expect(routes.has('GET /integrations/tasks')).toBe(false);
  });
});
