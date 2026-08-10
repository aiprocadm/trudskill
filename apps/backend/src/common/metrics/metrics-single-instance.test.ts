import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { MetricsService } from './metrics.service.js';
import { CoreModule } from '../../modules/core/core.module.js';
import { HealthModule } from '../../modules/health/health.module.js';

/**
 * Сборщик метрик должен быть ОДИН на всё приложение.
 *
 * ЗАЧЕМ ЭТОТ ТЕСТ. Реальная поломка, найденная на стенде 2026-08-10: метрика глубины
 * очереди `document_tasks_backlog` не появлялась в `/metrics`, хотя код, который её ставит,
 * отрабатывал. Причина оказалась не в коде метрик, а в СБОРКЕ МОДУЛЕЙ.
 *
 * `CoreModule` помечен `@Global()` и раздаёт единственный `MetricsService` всему
 * приложению. Но если какой-нибудь модуль пропишет `MetricsService` в своих `providers`,
 * Nest создаст ему ОТДЕЛЬНЫЙ экземпляр, который заслонит глобальный. Тогда получается
 * ровно то, что и наблюдали: готовность пишет значение в свой экземпляр, а ручка `/metrics`
 * читает из глобального — и наружу не выходит ничего.
 *
 * Беда тихая: ошибок нет, тесты модулей зелёные, метрика просто молча пустая. Поэтому
 * свойство закрепляется тестом, а не комментарием.
 */
const providersOf = (module: unknown): unknown[] =>
  (Reflect.getMetadata('providers', module as object) as unknown[]) ?? [];

const exportsOf = (module: unknown): unknown[] =>
  (Reflect.getMetadata('exports', module as object) as unknown[]) ?? [];

describe('сборщик метрик один на приложение', () => {
  it('CoreModule раздаёт его глобально', () => {
    expect(providersOf(CoreModule)).toContain(MetricsService);
    expect(exportsOf(CoreModule)).toContain(MetricsService);
    expect(Reflect.getMetadata('__module:global__', CoreModule)).toBe(true);
  });

  it('модуль здоровья НЕ заводит свой экземпляр', () => {
    // Готовность публикует глубину очереди как метрику. Со своим экземпляром значение
    // писалось бы «в стол»: наружу отдаёт глобальный.
    expect(providersOf(HealthModule)).not.toContain(MetricsService);
  });

  it('ни один модуль приложения не переопределяет сборщик метрик', async () => {
    // Сторож на будущее: та же ошибка в любом другом модуле даст ту же тихую пустоту.
    const suspects = await Promise.all([
      import('../../modules/documents/documents.module.js').then((m) => m.DocumentsModule),
      import('../../modules/platform/platform.module.js').then((m) => m.PlatformModule),
      import('../../modules/mvp/mvp.module.js').then((m) => m.MvpModule)
    ]);

    for (const module of suspects) {
      expect(
        providersOf(module),
        `модуль ${(module as { name?: string }).name} заводит свой MetricsService`
      ).not.toContain(MetricsService);
    }
  });
});
