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

/**
 * ФТ-F4 (Фаза 5 Task 9): фиксация посещения вебинара.
 *
 * Слушатель отмечается сам при подключении к комнате (глубокая интеграция с
 * площадкой — [P2], вне фазы; вебхук, если он есть, пишет точный durationSeconds
 * поверх). Часы посещённых вебинаров идут в журнал часов группы.
 */
describe('посещение вебинара (ФТ-F4)', () => {
  const makeService = () => {
    const state = new InMemoryWebinarsState();
    return { state, service: new WebinarsService(state, realtime, resolverWith({})) };
  };

  const withParticipant = async (service: WebinarsService, groupId?: string) => {
    const w = await service.create('t1', 'u_admin', { ...body, ...(groupId ? { groupId } : {}) });
    await service.patch('t1', w.id, { joinUrl: 'https://join/room' });
    await service.addParticipant('t1', w.id, {
      learnerId: 'l1',
      roleCode: 'attendee',
      attendanceStatus: 'invited'
    });
    return w;
  };

  it('слушатель отмечается: статус joined, joinedAt проставлен, ссылка возвращена', async () => {
    const { service } = makeService();
    const w = await withParticipant(service);
    const result = await service.joinAsParticipant('t1', 'l1', w.id);
    expect(result.attendanceStatus).toBe('joined');
    expect(result.joinUrl).toBe('https://join/room');
    const { items } = await service.listParticipants('t1', w.id, { page: 1, pageSize: 10 });
    expect(items[0]?.attendanceStatus).toBe('joined');
    expect(items[0]?.joinedAt).toBeTruthy();
  });

  it('повторная отметка идемпотентна: joinedAt не переписывается', async () => {
    const { service } = makeService();
    const w = await withParticipant(service);
    await service.joinAsParticipant('t1', 'l1', w.id);
    const first = (await service.listParticipants('t1', w.id, { page: 1, pageSize: 10 })).items[0]
      ?.joinedAt;
    await service.joinAsParticipant('t1', 'l1', w.id);
    const second = (await service.listParticipants('t1', w.id, { page: 1, pageSize: 10 })).items[0]
      ?.joinedAt;
    expect(second).toBe(first);
  });

  it('не участник — «не найдено»: чужой вебинар неотличим от несуществующего', async () => {
    const { service } = makeService();
    const w = await withParticipant(service);
    await expect(service.joinAsParticipant('t1', 'l_stranger', w.id)).rejects.toThrow();
  });

  it('часы группы: посещённый вебинар даёт плановую длительность, неотмеченный — ничего', async () => {
    const { service } = makeService();
    const w = await withParticipant(service, 'g1');
    // Второй приглашённый НЕ отметился — его секунды не появляются (acceptance ФТ-F4).
    await service.addParticipant('t1', w.id, {
      learnerId: 'l_absent',
      roleCode: 'attendee',
      attendanceStatus: 'invited'
    });
    await service.joinAsParticipant('t1', 'l1', w.id);

    const seconds = await service.groupAttendanceSeconds('t1', 'g1');
    expect(seconds.get('l1')).toBe(3600); // план 10:00–11:00
    expect(seconds.has('l_absent')).toBe(false);
  });

  it('точная длительность от вебхука площадки предпочтительнее плановой', async () => {
    const { service } = makeService();
    const w = await withParticipant(service, 'g1');
    await service.recordAttendance('t1', w.id, {
      participantRef: 'l1',
      attendanceStatus: 'left',
      durationSeconds: 1234
    });
    const seconds = await service.groupAttendanceSeconds('t1', 'g1');
    expect(seconds.get('l1')).toBe(1234);
  });

  it('вебинар другой группы в часы этой группы не попадает', async () => {
    const { service } = makeService();
    const w = await withParticipant(service, 'g_other');
    await service.joinAsParticipant('t1', 'l1', w.id);
    const seconds = await service.groupAttendanceSeconds('t1', 'g1');
    expect(seconds.size).toBe(0);
  });
});
