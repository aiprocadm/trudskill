import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { ONBOARDING_STEPS, TenantOnboardingService } from './tenant-onboarding.service.js';

interface Fixture {
  requisites?: { legalName: string; taxNumber: string } | null;
  branding?: Record<string, unknown>;
  licenses?: number;
  courses?: number;
  commissions?: number;
  templates?: number;
}

function make(data: Fixture = {}) {
  const tenants = {
    getRequisites: vi.fn(async () => {
      if (data.requisites === undefined || data.requisites === null) {
        throw new Error('tenant_requisites_not_found');
      }
      return data.requisites;
    }),
    getBranding: vi.fn(async () => data.branding ?? {})
  };
  const mvpRunner = {
    runWithTenantState: vi.fn(async (_tenantId: string, fn: (state: unknown) => Promise<unknown>) =>
      fn({
        courses: Array.from({ length: data.courses ?? 0 }, (_, i) => ({ id: `c${i}` })),
        commissions: Array.from({ length: data.commissions ?? 0 }, (_, i) => ({ id: `k${i}` }))
      })
    )
  };
  const documents = {
    loadIntoState: vi.fn(async (_tenantId: string, state: { templates: unknown[] }) => {
      state.templates.push(
        ...Array.from({ length: data.templates ?? 0 }, (_, i) => ({ id: `t${i}` }))
      );
    })
  };
  const db = {
    query: vi.fn(async (_sql: string, _params?: unknown[]) => [{ count: data.licenses ?? 0 }])
  };
  const service = new TenantOnboardingService(
    tenants as never,
    mvpRunner as never,
    documents as never,
    db as never
  );
  return { service, tenants, mvpRunner, documents, db };
}

describe('TenantOnboardingService (ФТ-D2.3)', () => {
  it('пустой центр: ни один шаг не закрыт, продолжаем с первого', async () => {
    const { service } = make();
    const status = await service.getStatus('t1');
    expect(status.doneCount).toBe(0);
    expect(status.totalCount).toBe(ONBOARDING_STEPS.length);
    expect(status.nextStepId).toBe('requisites');
    expect(status.ready).toBe(false);
  });

  it('прогресс из данных: реквизиты заполнили другим экраном — шаг уже закрыт', async () => {
    const { service } = make({
      requisites: { legalName: 'ООО «Пример»', taxNumber: '7700000000' }
    });
    const status = await service.getStatus('t1');
    const requisites = status.steps.find((step) => step.id === 'requisites');
    expect(requisites?.done).toBe(true);
    expect(requisites?.detail).toBe('ООО «Пример»');
    // Следующим предлагается первый НЕЗАКРЫТЫЙ, а не следующий по счёту.
    expect(status.nextStepId).toBe('license');
  });

  it('строка реквизитов есть, но поля пустые — шаг НЕ закрыт', async () => {
    const { service } = make({ requisites: { legalName: '   ', taxNumber: '' } });
    const status = await service.getStatus('t1');
    expect(status.steps.find((step) => step.id === 'requisites')?.done).toBe(false);
  });

  it('курсы и комиссии читаются из состояния MVP, а не из типизированных таблиц', async () => {
    const { service, mvpRunner, db } = make({ courses: 2, commissions: 1 });
    const status = await service.getStatus('t1');
    expect(status.steps.find((step) => step.id === 'course')?.done).toBe(true);
    expect(status.steps.find((step) => step.id === 'course')?.detail).toBe('Курсов: 2');
    expect(status.steps.find((step) => step.id === 'commission')?.done).toBe(true);
    expect(mvpRunner.runWithTenantState).toHaveBeenCalledWith('t1', expect.any(Function));
    // Единственный SQL — про лицензии; курсы/комиссии/шаблоны через раннеры.
    for (const call of db.query.mock.calls) {
      expect(call[0]).toContain('org.training_licenses');
    }
  });

  it('шаблоны читаются БЕЗ сохранения снимка документов', async () => {
    const { service, documents } = make({ templates: 3 });
    const status = await service.getStatus('t1');
    expect(status.steps.find((step) => step.id === 'template')?.detail).toBe(
      'Шаблонов документов: 3'
    );
    expect(documents.loadIntoState).toHaveBeenCalledTimes(1);
    expect((documents as unknown as { saveFromState?: unknown }).saveFromState).toBeUndefined();
  });

  it('бренд: достаточно любого осмысленного элемента, мусор не считается', async () => {
    const named = make({ branding: { displayName: 'УЦ «Пример»' } });
    const namedStatus = await named.service.getStatus('t1');
    expect(namedStatus.steps.find((step) => step.id === 'branding')?.done).toBe(true);
    expect(namedStatus.steps.find((step) => step.id === 'branding')?.detail).toBe('УЦ «Пример»');

    // В сервис приходит УЖЕ отфильтрованный бренд (readTenantBranding отбрасывает мусор),
    // поэтому пустой объект — это «мусор не прошёл».
    const garbage = make({ branding: {} });
    const garbageStatus = await garbage.service.getStatus('t1');
    expect(garbageStatus.steps.find((step) => step.id === 'branding')?.done).toBe(false);
  });

  it('шаги идут в порядке онбординга и не теряются', async () => {
    const { service } = make();
    const status = await service.getStatus('t1');
    expect(status.steps.map((step) => step.id)).toEqual([...ONBOARDING_STEPS]);
  });

  it('все шесть шагов закрыты — центр готов к работе', async () => {
    const { service } = make({
      requisites: { legalName: 'ООО «Пример»', taxNumber: '7700000000' },
      branding: { displayName: 'УЦ' },
      licenses: 1,
      commissions: 1,
      templates: 2,
      courses: 3
    });
    const status = await service.getStatus('t1');
    expect(status.doneCount).toBe(6);
    expect(status.ready).toBe(true);
    expect(status.nextStepId).toBeNull();
  });

  it('сбой любого источника не валит экран — шаг просто считается незакрытым', async () => {
    const { service, mvpRunner } = make({ requisites: { legalName: 'ООО', taxNumber: '77' } });
    mvpRunner.runWithTenantState.mockRejectedValueOnce(new Error('db down'));
    const status = await service.getStatus('t1');
    expect(status.steps.find((step) => step.id === 'course')?.done).toBe(false);
    expect(status.steps.find((step) => step.id === 'requisites')?.done).toBe(true);
  });

  it('только действующие лицензии закрывают шаг', async () => {
    const { service, db } = make({ licenses: 1 });
    await service.getStatus('t1');
    expect(db.query.mock.calls[0]![0]).toContain("status = 'active'");
  });
});
