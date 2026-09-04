import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEP_META,
  type OnboardingStatusDto,
  type OnboardingStepDto,
  onboardingPercent,
  orderStepsForDisplay
} from './types';
import { routeMeta } from '../navigation/model';

import type { onboardingApi as OnboardingApi } from './api';
import type { UserSession } from '../../entities/session/model';

const step = (id: OnboardingStepDto['id'], done: boolean): OnboardingStepDto => ({ id, done });

describe('onboarding meta (ФТ-D2.3)', () => {
  it('у каждого шага есть заголовок, подсказка, экран и право', () => {
    for (const id of ONBOARDING_STEP_IDS) {
      const meta = ONBOARDING_STEP_META[id];
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.hint.length).toBeGreaterThan(0);
      expect(meta.href.startsWith('/')).toBe(true);
      expect(meta.requiredPermission).toMatch(/^[a-z_]+\.[a-z_.]+$/);
    }
  });

  it('шаг объясняет нехватку доступа по-русски, а не кодом права', () => {
    // Правило продукта: ни одного сырого кода как значения. Раньше человеку показывали
    // «Нужен доступ documents.write» — он не знает ни таких слов, ни у кого их просить.
    // Форму права здесь НЕ проверяем: существует ли оно на самом деле, сверяет сторож
    // `permission-coverage.isolation.test.ts` — канон прав в миграциях (журнал 311, 312).
    for (const id of ONBOARDING_STEP_IDS) {
      const meta = ONBOARDING_STEP_META[id];
      expect(meta.accessLabel.length).toBeGreaterThan(0);
      expect(meta.accessLabel).not.toMatch(/[a-z_]+\.[a-z_.]+/);
      expect(meta.accessLabel).toMatch(/[а-яё]/i);
    }
  });

  it('право шага — право ДЕЙСТВИЯ, а не просмотра: реквизиты правит tenant.settings.write', () => {
    // Журнал 343: шаг «Реквизиты центра» стоял под `tenant.read`, которое есть у всех, —
    // мастер говорил «можно», а ручка `PUT /tenant/requisites` (0083) отвечала отказом.
    expect(ONBOARDING_STEP_META.requisites.requiredPermission).toBe('tenant.settings.write');
  });

  it('каждый шаг ведёт на СУЩЕСТВУЮЩИЙ маршрут — мастер не обещает несуществующих экранов', () => {
    const patterns = routeMeta.map((entry) => entry.pattern);
    for (const id of ONBOARDING_STEP_IDS) {
      const { href } = ONBOARDING_STEP_META[id];
      expect(patterns.some((pattern) => href === pattern || href.startsWith(`${pattern}/`))).toBe(
        true
      );
    }
  });

  it('процент готовности считается от общего числа шагов', () => {
    const status = (doneCount: number, totalCount: number) =>
      ({ doneCount, totalCount }) as OnboardingStatusDto;
    expect(onboardingPercent(status(0, 6))).toBe(0);
    expect(onboardingPercent(status(3, 6))).toBe(50);
    expect(onboardingPercent(status(6, 6))).toBe(100);
    // Пустой список шагов не должен давать деление на ноль.
    expect(onboardingPercent(status(0, 0))).toBe(0);
  });

  it('незакрытые шаги показываются первыми, порядок внутри групп сохраняется', () => {
    const ordered = orderStepsForDisplay([
      step('requisites', true),
      step('license', false),
      step('branding', true),
      step('commission', false)
    ]);
    expect(ordered.map((item) => item.id)).toEqual([
      'license',
      'commission',
      'requisites',
      'branding'
    ]);
  });
});

describe('onboarding api contract (ФТ-D2.3)', () => {
  const fetchMock = vi.fn();
  let onboardingApi: typeof OnboardingApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    onboardingApi = (await import('./api')).onboardingApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('get разворачивает конверт и ходит с заголовком тенанта', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            steps: [{ id: 'requisites', done: true, detail: 'ООО «Пример»' }],
            doneCount: 1,
            totalCount: 6,
            nextStepId: 'license',
            ready: false
          },
          meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-08-04T00:00:00.000Z' }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const session = {
      user: { id: 'u1', tenantId: 'tenant_demo' },
      tokens: { accessToken: 't' }
    } as UserSession;
    const result = await onboardingApi.get(session);

    expect(result.nextStepId).toBe('license');
    expect(result.steps[0]?.detail).toBe('ООО «Пример»');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/tenant/onboarding');
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_demo');
  });
});
