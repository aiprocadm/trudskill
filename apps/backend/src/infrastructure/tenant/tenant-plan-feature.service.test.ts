import { describe, expect, it } from 'vitest';

import { TenantPlanFeatureService } from './tenant-plan-feature.service.js';

import type { DatabaseService } from '../database/database.service.js';

/**
 * Возможности тарифа (журнал 325).
 *
 * Тариф объявляет `proctoring` / `scorm` / `webinars`, отчёт их показывает — и не соблюдал
 * НИКТО. Тот же класс, что лимиты (записи 306/307), только про возможности, а не про числа.
 */
const dbReturning = (rows: unknown[]): DatabaseService =>
  ({ query: async () => rows }) as unknown as DatabaseService;

describe('TenantPlanFeatureService — возможность тарифа', () => {
  it('без базы молчит: гейт, который не может посчитать, не имеет права запрещать', async () => {
    const service = new TenantPlanFeatureService();

    await expect(service.assertFeature('t1', 'proctoring')).resolves.toBeUndefined();
  });

  it('без тарифа разрешает — как и лимиты', async () => {
    const service = new TenantPlanFeatureService(dbReturning([]));

    await expect(service.assertFeature('t1', 'proctoring')).resolves.toBeUndefined();
  });

  it('возможность явно выключена — отказ с человеческим текстом и названием тарифа', async () => {
    const service = new TenantPlanFeatureService(
      dbReturning([{ name: 'Базовый', features: { proctoring: false } }])
    );

    await expect(service.assertFeature('t1', 'proctoring')).rejects.toThrow(/Базовый/);
    await expect(service.assertFeature('t1', 'proctoring')).rejects.toThrow(/прокторинг/i);
  });

  it('возможность включена — пропускает', async () => {
    const service = new TenantPlanFeatureService(
      dbReturning([{ name: 'Полный', features: { proctoring: true } }])
    );

    await expect(service.assertFeature('t1', 'proctoring')).resolves.toBeUndefined();
  });

  it('возможность в тарифе не упомянута — РАЗРЕШАЕТ, и это осознанное решение', async () => {
    // Запрещать по умолчанию нельзя: сегодня флаги не проставлены ни у одного центра, и
    // строгое чтение «нет в списке = не входит» выключило бы прокторинг, SCORM и вебинары
    // у ВСЕХ разом в момент вливания. Запрещает только явное `false` — тогда флаг наконец
    // что-то значит, а поведение действующих центров не меняется.
    const service = new TenantPlanFeatureService(dbReturning([{ name: 'Базовый', features: {} }]));

    await expect(service.assertFeature('t1', 'proctoring')).resolves.toBeUndefined();
  });

  it('мусор вместо флага не запрещает: не-boolean значение — это не «выключено»', async () => {
    const service = new TenantPlanFeatureService(
      dbReturning([{ name: 'Базовый', features: { proctoring: 'нет' } }])
    );

    await expect(service.assertFeature('t1', 'proctoring')).resolves.toBeUndefined();
  });

  it('у каждой возможности своя человеческая подпись — кодов пользователю не показываем', async () => {
    const service = new TenantPlanFeatureService(
      dbReturning([{ name: 'Базовый', features: { scorm: false, webinars: false } }])
    );

    await expect(service.assertFeature('t1', 'scorm')).rejects.toThrow(/SCORM/);
    await expect(service.assertFeature('t1', 'webinars')).rejects.toThrow(/вебинар/i);
  });
});
