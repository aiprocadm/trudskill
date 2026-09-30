import 'reflect-metadata';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { mapGroup } from './catalog.js';
import { enrollmentsFromTrainings, resultCodeOf } from './enrollments.js';
import { ImportLiveExecutor } from './import-live.executor.js';
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
import type { CdoprofGroup, CdoprofTrainingsResponse } from './sources/cdoprof-api.schemas.js';
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

const makeWorld = () => {
  const state = new InMemoryMvpState();
  const events = new EventEmitter2();
  const emit = vi.spyOn(events, 'emit');
  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    undefined as never,
    undefined as never,
    events
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
  return { state, store, run, emit };
};

describe('итог прохождения CDOPROF (срез 23.3b, РМ137)', () => {
  it('код и слова источника → итог центра; непонятное — «не распознан», пустое — нет итога', () => {
    expect(resultCodeOf({ code: 1, result: 'passed', result_rus: 'Сдал' })).toBe('passed');
    expect(resultCodeOf({ code: 0, result: 'failed', result_rus: 'Не сдал' })).toBe('failed');
    expect(resultCodeOf({ code: 2, result: 'absent', result_rus: 'Неявка' })).toBe('absent');
    expect(resultCodeOf({ result_rus: 'Не сдал' })).toBe('failed');
    expect(resultCodeOf({ result_rus: 'Сдал' })).toBe('passed');
    expect(resultCodeOf({ code: 7, result_rus: 'Перевод' })).toBe('unknown');
    expect(resultCodeOf(null)).toBeUndefined();
  });

  it('«сдал» — завершено с датой окончания группы; «не сдал», «неявка» — отменено; идёт — учится', () => {
    const groups = new Map(
      dataset.groups.map((g) => [
        String(g.id),
        mapGroup(g as unknown as CdoprofGroup, TODAY).draft!
      ])
    );
    const responses = Object.values(dataset.trainings).map(
      (items) => ({ items }) as unknown as CdoprofTrainingsResponse
    );
    const drafts = new Map(
      enrollmentsFromTrainings(responses, (id) => groups.get(id)).map((r) => [
        r.sourceId,
        r.mapped.draft!
      ])
    );
    expect(drafts.get('1001:5001')).toMatchObject({
      status: 'completed',
      resultCode: 'passed',
      enrolledOn: '2024-01-15',
      completedOn: '2024-01-31'
    });
    expect(drafts.get('1001:5002')).toMatchObject({ status: 'cancelled', resultCode: 'failed' });
    expect(drafts.get('1004:5004')).toMatchObject({ status: 'cancelled', resultCode: 'absent' });
    expect(drafts.get('1008:5005')).toMatchObject({ status: 'active' });
    expect(drafts.get('1008:5005')?.resultCode).toBeUndefined();
    expect(drafts.size).toBe(6);
  });

  it('несколько курсов в группе с разными итогами — берётся худший, с замечанием', () => {
    const response = {
      items: [
        {
          student: { id: 1 },
          trainings: [
            { course: { id: 10 }, group: { id: 20 }, result: { code: 1 } },
            { course: { id: 11 }, group: { id: 20 }, result: { code: 0 } }
          ]
        }
      ]
    } as unknown as CdoprofTrainingsResponse;
    const [record] = enrollmentsFromTrainings([response], () => undefined);
    expect(record!.mapped.draft).toMatchObject({ status: 'cancelled', resultCode: 'failed' });
    expect(record!.mapped.notes.map((n) => n.code)).toEqual(['enrollment_results_merged']);
  });
});

describe('перенос зачислений (срез 23.3b)', () => {
  it('зачисляет с итогом и датами — без приглашений и без события «завершено»', async () => {
    const { state, run, emit } = makeWorld();
    const result = await run('all');
    expect(result.status).toBe('succeeded');
    expect(result.stats.byDomain.enrollments).toMatchObject({ created: 6, failed: 0 });

    const ivanov = state.learners.find((l) => l.externalId === '1001')!;
    const g5001 = state.groups.find((g) => g.externalId === '5001')!;
    const enrollment = state.enrollments.find(
      (e) => e.learnerId === ivanov.id && e.groupId === g5001.id
    )!;
    expect(enrollment).toMatchObject({
      status: 'completed',
      resultCode: 'passed',
      enrolledAt: '2024-01-15T00:00:00.000Z',
      completedAt: '2024-01-31T00:00:00.000Z',
      externalId: '1001:5001',
      sourceSystem: 'cdoprof'
    });
    const history = state.enrollmentStatusHistory.filter((h) => h.enrollmentId === enrollment.id);
    expect(history).toEqual([
      expect.objectContaining({ status: 'completed', reason: 'импорт из прежней системы' })
    ]);
    /* Ни одного события зачисления: документы не выпускаются, письма не уходят. */
    expect(emit.mock.calls.filter(([name]) => String(name).includes('enrollment'))).toEqual([]);
  });

  it('повтор — 0 новых зачислений', async () => {
    const { state, run } = makeWorld();
    await run('all');
    const again = await run('all');
    expect(again.stats.created).toBe(0);
    expect(again.stats.byDomain.enrollments).toMatchObject({ skipped: 6 });
    expect(state.enrollments).toHaveLength(6);
  });

  it('без перенесённых слушателей — отказ словами по каждой паре', async () => {
    const { run } = makeWorld();
    await run('groups');
    const result = await run('enrollments');
    expect(result.stats).toMatchObject({ created: 0, failed: 6 });
  });
});
