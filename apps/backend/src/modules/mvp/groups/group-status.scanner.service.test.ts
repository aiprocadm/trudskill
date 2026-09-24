import { describe, expect, it, vi } from 'vitest';

import { GroupStatusScanner } from './group-status.scanner.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/** МГ-B3.1: автопереходы recruiting → in_progress и in_progress → exam; остальное — вручную (РМ46). */
const T = 'tenant_demo';
const AT = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

function makeState(): InMemoryMvpState {
  const state = new InMemoryMvpState();
  state.tenantTimezone = 'Europe/Moscow';
  state.groups.push(
    // Набор, начало сегодня, есть активный слушатель → учатся.
    {
      id: 'g_start',
      tenantId: T,
      ...AT,
      code: '1',
      name: '1',
      status: 'recruiting',
      startDate: '2026-09-24'
    } as never,
    // Набор, начало сегодня, но слушателей нет → остаётся.
    {
      id: 'g_empty',
      tenantId: T,
      ...AT,
      code: '2',
      name: '2',
      status: 'recruiting',
      startDate: '2026-09-24'
    } as never,
    // Набор, начало завтра → остаётся.
    {
      id: 'g_future',
      tenantId: T,
      ...AT,
      code: '3',
      name: '3',
      status: 'recruiting',
      startDate: '2026-09-25'
    } as never,
    // Старый scheduled (= recruiting) с началом вчера и слушателем → учатся.
    {
      id: 'g_legacy',
      tenantId: T,
      ...AT,
      code: '4',
      name: '4',
      status: 'scheduled',
      startDate: '2026-09-23'
    } as never,
    // Учатся, доступ к экзамену открылся минуту назад → экзамен.
    {
      id: 'g_access',
      tenantId: T,
      ...AT,
      code: '5',
      name: '5',
      status: 'in_progress',
      examAccessFrom: '2026-09-24T09:59:00.000Z'
    } as never,
    // Учатся, день экзамена сегодня → экзамен.
    {
      id: 'g_examday',
      tenantId: T,
      ...AT,
      code: '6',
      name: '6',
      status: 'active',
      examDate: '2026-09-24'
    } as never,
    // Учатся, экзамен завтра, доступ ещё не открыт → остаётся.
    {
      id: 'g_tomorrow',
      tenantId: T,
      ...AT,
      code: '7',
      name: '7',
      status: 'in_progress',
      examDate: '2026-09-25',
      examAccessFrom: '2026-09-25T00:00:00.000Z'
    } as never,
    // Ждут документов — сканер не трогает (Фаза 3).
    {
      id: 'g_docs',
      tenantId: T,
      ...AT,
      code: '8',
      name: '8',
      status: 'documents',
      examDate: '2026-09-01'
    } as never,
    // Чужой центр.
    {
      id: 'g_other',
      tenantId: 't2',
      ...AT,
      code: '9',
      name: '9',
      status: 'recruiting',
      startDate: '2026-09-01'
    } as never
  );
  state.enrollments.push(
    {
      id: 'e1',
      tenantId: T,
      ...AT,
      groupId: 'g_start',
      learnerId: 'l1',
      status: 'active'
    } as never,
    {
      id: 'e2',
      tenantId: T,
      ...AT,
      groupId: 'g_legacy',
      learnerId: 'l2',
      status: 'active'
    } as never,
    {
      id: 'e3',
      tenantId: T,
      ...AT,
      groupId: 'g_empty',
      learnerId: 'l3',
      status: 'cancelled'
    } as never,
    {
      id: 'e9',
      tenantId: 't2',
      ...AT,
      groupId: 'g_other',
      learnerId: 'l9',
      status: 'active'
    } as never
  );
  return state;
}

describe('GroupStatusScanner', () => {
  it('переводит только дозревшие группы своего центра и пишет аудит с системным актором', () => {
    const audit = { write: vi.fn() };
    const scanner = new GroupStatusScanner(audit as never);
    const state = makeState();
    // 24.09 13:00 по Москве (10:00 UTC).
    const moved = scanner.scanTenant(T, '2026-09-24T10:00:00.000Z', state);
    expect(moved).toBe(4);
    const byId = Object.fromEntries(state.groups.map((g) => [g.id, g.status]));
    expect(byId).toMatchObject({
      g_start: 'in_progress',
      g_empty: 'recruiting',
      g_future: 'recruiting',
      g_legacy: 'in_progress',
      g_access: 'exam',
      g_examday: 'exam',
      g_tomorrow: 'in_progress',
      g_docs: 'documents',
      g_other: 'recruiting'
    });
    expect(audit.write).toHaveBeenCalledTimes(4);
    expect(audit.write.mock.calls[0]?.[0]).toMatchObject({
      actorId: 'system',
      action: 'learning.group_status_auto',
      entityId: 'g_start',
      oldValues: { status: 'recruiting' },
      newValues: { status: 'in_progress' }
    });
  });

  it('«сегодня» считается в поясе центра: в 22:30 UTC в Москве уже завтра', () => {
    const scanner = new GroupStatusScanner({ write: vi.fn() } as never);
    const state = makeState();
    const moved = scanner.scanTenant(T, '2026-09-24T22:30:00.000Z', state);
    // g_future (начало 25.09) и g_tomorrow (экзамен 25.09) дозрели по московскому календарю.
    expect(moved).toBe(5);
    expect(state.groups.find((g) => g.id === 'g_future')?.status).toBe('recruiting');
    expect(state.groups.find((g) => g.id === 'g_tomorrow')?.status).toBe('exam');
  });

  it('повторный прогон ничего не меняет', () => {
    const audit = { write: vi.fn() };
    const scanner = new GroupStatusScanner(audit as never);
    const state = makeState();
    scanner.scanTenant(T, '2026-09-24T10:00:00.000Z', state);
    expect(scanner.scanTenant(T, '2026-09-24T10:00:00.000Z', state)).toBe(0);
  });
});
