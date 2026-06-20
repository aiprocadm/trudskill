import { describe, expect, it } from 'vitest';

import { InMemoryWebinarsState } from './in-memory-webinars.state.js';

const baseWebinar = {
  id: 'w1',
  tenantId: 't1',
  title: 'Intro',
  plannedStartAt: '2026-07-01T10:00:00.000Z',
  plannedEndAt: '2026-07-01T11:00:00.000Z',
  status: 'planned' as const,
  createdBy: 'u1',
  createdAt: '2026-07-01T09:00:00.000Z',
  updatedAt: '2026-07-01T09:00:00.000Z'
};

describe('InMemoryWebinarsState — provider/attendance extensions', () => {
  it('findByProviderSessionId locates a webinar across tenants', async () => {
    const state = new InMemoryWebinarsState();
    await state.create({ ...baseWebinar, providerSessionId: 'ps_1' });
    const found = await state.findByProviderSessionId('ps_1');
    expect(found?.tenantId).toBe('t1');
    expect(await state.findByProviderSessionId('missing')).toBeNull();
  });

  it('upsertParticipantAttendance creates then updates a participant', async () => {
    const state = new InMemoryWebinarsState();
    await state.create(baseWebinar);
    await state.upsertParticipantAttendance('t1', 'w1', {
      participantRef: 'l1',
      attendanceStatus: 'joined',
      joinedAt: '2026-07-01T10:00:00.000Z'
    });
    await state.upsertParticipantAttendance('t1', 'w1', {
      participantRef: 'l1',
      attendanceStatus: 'left',
      leftAt: '2026-07-01T10:30:00.000Z',
      durationSeconds: 1800
    });
    const { items } = await state.listParticipants('t1', 'w1', {});
    expect(items).toHaveLength(1);
    expect(items[0]?.attendanceStatus).toBe('left');
    expect(items[0]?.durationSeconds).toBe(1800);
  });
});
