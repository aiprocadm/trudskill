import { describe, expect, it, vi } from 'vitest';

import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { WebinarsService } from './webinars.service.js';

import type { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import type { WebinarProvider } from '../../infrastructure/webinar-provider/webinar.provider.js';

const realtime = { publish: vi.fn() } as any;

const resolverWith = (provider: Partial<WebinarProvider>): WebinarProviderResolver =>
  ({
    forTenant: async () => ({
      code: 'fake',
      createSession: async () => null,
      parseWebhook: async () => null,
      ...provider
    })
  }) as unknown as WebinarProviderResolver;

const body = {
  title: 'Intro',
  plannedStartAt: '2026-07-01T10:00:00.000Z',
  plannedEndAt: '2026-07-01T11:00:00.000Z'
};

describe('WebinarsService.create — provider wiring (fail-soft)', () => {
  it('stores provider session fields when createSession succeeds', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(
      state,
      realtime,
      resolverWith({
        createSession: async () => ({
          providerSessionId: 'ps_1',
          joinUrl: 'https://join',
          hostUrl: 'https://host'
        })
      })
    );
    const w = await service.create('t1', 'u1', body);
    expect(w.providerSessionId).toBe('ps_1');
    expect(w.joinUrl).toBe('https://join');
    expect(w.providerCode).toBe('fake');
  });

  it('still creates the webinar when the provider returns null', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(
      state,
      realtime,
      resolverWith({ createSession: async () => null })
    );
    const w = await service.create('t1', 'u1', body);
    expect(w.status).toBe('planned');
    expect(w.joinUrl).toBeUndefined();
  });

  it('still creates the webinar when the provider throws (fail-soft)', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(
      state,
      realtime,
      resolverWith({
        createSession: async () => {
          throw new Error('provider down');
        }
      })
    );
    const w = await service.create('t1', 'u1', body);
    expect(w.status).toBe('planned');
    expect(w.providerSessionId).toBeUndefined();
  });

  it('listMine returns only webinars the learner participates in', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(state, realtime, resolverWith({}));
    const w = await service.create('t1', 'u1', body);
    await service.addParticipant('t1', w.id, {
      learnerId: 'l1',
      roleCode: 'attendee',
      attendanceStatus: 'invited'
    });
    const mine = await service.listMine('t1', 'l1');
    expect(mine.map((x) => x.id)).toContain(w.id);
    expect(await service.listMine('t1', 'l2')).toHaveLength(0);
  });
});
