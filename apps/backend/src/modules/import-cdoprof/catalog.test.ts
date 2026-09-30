import 'reflect-metadata';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { mapCourse, mapGroup, mapParentCourse } from './catalog.js';
import { ImportLiveExecutor } from './import-live.executor.js';
import { planImport } from './import-planner.js';
import { ImportRunsStore } from './import-runs.store.js';
import { CdoprofApiClient } from './sources/cdoprof-api-client.js';
import {
  FixtureCdoprofTransport,
  loadFixtureDataset
} from './sources/fixture-cdoprof-transport.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import { BackgroundTasksService } from '../background-tasks/background-tasks.service.js';
import { InMemoryMvpState } from '../mvp/infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp/mvp.service.js';

import type { ImportRunDomain } from './import.types.js';
import type {
  CdoprofCourse,
  CdoprofGroup,
  CdoprofParentCourse
} from './sources/cdoprof-api.schemas.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { MvpStateWriter } from '../mvp/mvp-state-writer.service.js';

const TENANT = 'tenant_a';
const TODAY = new Date('2026-09-30T12:00:00Z');
const ctx = {
  tenantId: TENANT,
  userId: 'u_admin',
  requestId: 'r',
  correlationId: 'c'
} as RequestContext;
const client = () => new CdoprofApiClient(new FixtureCdoprofTransport(loadFixtureDataset()));
const dataset = loadFixtureDataset();
const group = (id: number) => dataset.groups.find((g) => g.id === id) as unknown as CdoprofGroup;

const makeWorld = () => {
  const state = new InMemoryMvpState();
  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    undefined as never,
    undefined as never,
    new EventEmitter2()
  );
  const writer = {
    run: vi.fn(async (_tenantId: string, fn: (m: MvpService) => unknown) => fn(mvp))
  };
  const store = new ImportRunsStore();
  const executor = new ImportLiveExecutor(
    store,
    writer as unknown as MvpStateWriter,
    new BackgroundTasksService()
  );
  const run = async (domain: ImportRunDomain) => {
    const created = await store.createRun({
      tenantId: TENANT,
      source: 'api',
      domain,
      dryRun: false
    });
    await executor.execute({
      tenantId: TENANT,
      actorId: 'u_admin',
      runId: created.id,
      domain,
      client: client(),
      context: ctx,
      today: TODAY
    });
    return (await store.getRun(TENANT, created.id))!;
  };
  return { state, store, run };
};

describe('разбор каталога и групп CDOPROF (срез 23.3a)', () => {
  it('статус группы — по датам: > 12 мес. — архив (РМ3), идёт — «учатся», без дат — черновик', () => {
    expect(mapGroup(group(5001), TODAY).draft).toMatchObject({
      status: 'archived',
      code: '2024-001',
      endDate: '2024-01-31'
    });
    expect(mapGroup(group(5005), TODAY).draft?.status).toBe('in_progress');
    const noDates = mapGroup(group(5004), TODAY);
    expect(noDates.draft?.status).toBe('draft');
    expect(noDates.notes.map((n) => n.code)).toEqual(['group_dates_missing']);
    const recent = mapGroup(
      { id: 1, name_group: 'Н-1', date_on: '2026-06-01', date_off: '2026-06-30' } as CdoprofGroup,
      TODAY
    );
    expect(recent.draft?.status).toBe('closed');
    const future = mapGroup(
      { id: 2, name_group: 'Н-2', date_on: '2026-11-01', date_off: '2026-11-30' } as CdoprofGroup,
      TODAY
    );
    expect(future.draft?.status).toBe('recruiting');
  });

  it('окончание раньше начала и экзамен вне сроков не переносятся, но группа — да', () => {
    const odd = mapGroup(
      {
        id: 3,
        name_group: 'Н-3',
        date_on: '2026-06-10',
        date_off: '2026-06-01',
        date_exam_end: '2026-05-01'
      } as CdoprofGroup,
      TODAY
    );
    expect(odd.draft?.endDate).toBeUndefined();
    expect(odd.draft?.examDate).toBeUndefined();
    expect(odd.notes.map((n) => n.code)).toEqual(['group_end_before_start', 'group_exam_dropped']);
  });

  it('код направления — «R13» из названия; курс без кода — «ИМП-id» с замечанием; часы — в примечание', () => {
    expect(
      mapParentCourse({ id: 1, name_course: 'R13 1. Охрана труда' } as CdoprofParentCourse).draft
        ?.code
    ).toBe('R13');
    expect(
      mapParentCourse({ id: 3, name_course: '6. Дипломы' } as CdoprofParentCourse).draft?.code
    ).toBe('ИМП-Н3');
    const noCode = mapCourse({ id: 312, name_course: 'Курс без кода' } as CdoprofCourse);
    expect(noCode.draft?.code).toBe('ИМП-312');
    expect(noCode.notes.map((n) => n.code)).toEqual(['course_code_missing']);
    const withHours = mapCourse({
      id: 309,
      cod: 'R13.Б',
      name_course: 'Б',
      count_hour: 16,
      hours_theory: 12,
      hours_practice: 4,
      period_obuch: 1
    } as CdoprofCourse);
    expect(withHours.draft?.note).toBe(
      'Из прежней системы: 16 ч; теория 12, практика 4; срок 1 мес..'
    );
  });
});

describe('перенос каталога и групп (срез 23.3a)', () => {
  it('курс привязан к направлению, группа — к курсу; повтор номера группы — «номер-id»', async () => {
    const { state, run } = makeWorld();
    const result = await run('all');
    expect(result.status).toBe('succeeded');

    const r13 = state.directions.find((d) => d.code === 'R13')!;
    const course309 = state.courses.find((c) => c.code === 'R13.Б')!;
    expect(course309.directionId).toBe(r13.id);
    expect(state.courses.find((c) => c.code === 'ИМП-312')?.directionId).toBeUndefined();

    const g5001 = state.groups.find((g) => g.externalId === '5001')!;
    expect(g5001).toMatchObject({
      status: 'archived',
      closedAt: '2024-01-31T00:00:00.000Z',
      sourceSystem: 'cdoprof'
    });
    expect(g5001.archivedAt).toBeTruthy();
    expect(state.groups.find((g) => g.externalId === '5003')).toMatchObject({
      code: '2024-002-5003',
      legacyNumber: '2024-002'
    });
    expect(
      state.groupCourses.some((gc) => gc.groupId === g5001.id && gc.courseId === course309.id)
    ).toBe(true);
    expect(state.groupCourses).toHaveLength(5);
  });

  it('курсы групп отдельным запуском находят перенесённые раньше группы и курсы', async () => {
    const { state, run } = makeWorld();
    await run('courses');
    await run('groups');
    const pairs = await run('group_courses');
    expect(pairs.stats).toMatchObject({ created: 5, failed: 0 });
    expect(state.groupCourses).toHaveLength(5);
  });

  it('курс группы без перенесённой группы — отказ словами, а не молчаливый пропуск', async () => {
    const { run } = makeWorld();
    await run('courses');
    const pairs = await run('group_courses');
    expect(pairs.stats).toMatchObject({ created: 0, failed: 5 });
  });

  it('повтор ошибок по группе получает тот же код, что при полном переносе', async () => {
    const plan = await planImport({
      tenantId: TENANT,
      domain: 'groups',
      client: client(),
      snapshot: { learners: [], counterparties: [] },
      today: TODAY,
      only: new Set(['groups:5003'])
    });
    expect(plan.byDomain.groups?.map((row) => row.sourceId)).toEqual(['5003']);
    expect(plan.drafts.groups.get('5003')?.code).toBe('2024-002-5003');
  });
});
