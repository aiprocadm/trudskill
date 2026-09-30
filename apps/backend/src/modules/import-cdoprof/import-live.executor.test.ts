import 'reflect-metadata';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { ImportCdoprofService } from './import-cdoprof.service.js';
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

import type { LiveRunInput } from './import-live.executor.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { MvpStateWriter } from '../mvp/mvp-state-writer.service.js';
import type { Counterparty, Learner } from '../mvp/mvp.types.js';

const TENANT = 'tenant_a';
const TODAY = new Date('2026-09-30T12:00:00Z');
const ctx = {
  tenantId: TENANT,
  userId: 'u_admin',
  requestId: 'r',
  correlationId: 'c'
} as RequestContext;

const fixtureClient = () => new CdoprofApiClient(new FixtureCdoprofTransport(loadFixtureDataset()));

/** Настоящая служба центра над снимком в памяти; «писатель» просто отдаёт её. */
const makeWorld = (seed: { learners?: Learner[]; counterparties?: Counterparty[] } = {}) => {
  const state = new InMemoryMvpState();
  state.learners.push(...(seed.learners ?? []));
  state.counterparties.push(...(seed.counterparties ?? []));
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
  const tasks = new BackgroundTasksService();
  const executor = new ImportLiveExecutor(store, writer as unknown as MvpStateWriter, tasks);
  return { state, mvp, writer, store, tasks, executor };
};

const liveRun = async (
  world: ReturnType<typeof makeWorld>,
  patch: Partial<LiveRunInput> = {},
  chunkSize = 3
) => {
  const task = await world.tasks.start({
    tenantId: TENANT,
    kind: 'data_import',
    title: 'Перенос'
  });
  const run = await world.store.createRun({
    tenantId: TENANT,
    source: 'api',
    domain: 'all',
    dryRun: false,
    backgroundTaskId: task.id
  });
  await world.executor.execute(
    {
      tenantId: TENANT,
      actorId: 'u_admin',
      runId: run.id,
      backgroundTaskId: task.id,
      domain: 'all',
      client: fixtureClient(),
      context: ctx,
      today: TODAY,
      ...patch
    },
    chunkSize
  );
  return {
    run: (await world.store.getRun(TENANT, run.id))!,
    task: (await world.tasks.list(TENANT))[0]!
  };
};

const base = { tenantId: TENANT, status: 'active', createdAt: '', updatedAt: '' };

describe('боевой прогон импорта (МГ-K3.1/K2.1, срез 23.2)', () => {
  it('переносит компании и слушателей с меткой источника и связью «слушатель → компания»', async () => {
    const world = makeWorld();
    const { run, task } = await liveRun(world);

    expect(run.status).toBe('succeeded');
    expect(run.stats).toMatchObject({ created: 36, skipped: 1, failed: 0 });
    expect(run.stats.byDomain).toMatchObject({
      counterparties: { created: 4 },
      learners: { created: 7, skipped: 1 }
    });
    expect(world.state.counterparties).toHaveLength(4);
    expect(world.state.learners).toHaveLength(7);
    const ivanov = world.state.learners.find((l) => l.externalId === '1001')!;
    const company = world.state.counterparties.find((c) => c.externalId === '101')!;
    expect(ivanov).toMatchObject({
      sourceSystem: 'cdoprof',
      counterpartyId: company.id,
      dateOfBirth: '1985-03-12'
    });
    expect(company).toMatchObject({ code: 'ИМП-101', inn: '7700000001', sourceSystem: 'cdoprof' });
    /* Кандидат на слияние не заведён: сливать решает человек. */
    expect(world.state.learners.some((l) => l.externalId === '1003')).toBe(false);
    expect(world.store.legacyTargetOf(TENANT, 'learners', '1001')).toBe(ivanov.id);
    expect(task).toMatchObject({ status: 'succeeded', doneCount: 36 });
    /* Частями: замок центра отпускается между ними. */
    expect(world.writer.run.mock.calls.length).toBeGreaterThan(3);
  });

  it('повтор даёт 0 новых записей — всё «уже перенесено, изменений нет»', async () => {
    const world = makeWorld();
    await liveRun(world);
    const { run } = await liveRun(world);

    expect(run.stats.created).toBe(0);
    expect(world.state.learners).toHaveLength(7);
    expect(world.state.counterparties).toHaveLength(4);
    const unchanged = await world.store.listRows(TENANT, run.id, {
      errorCode: 'unchanged',
      limit: 50,
      offset: 0
    });
    expect(unchanged.total).toBe(36);
  });

  it('дописывает только пустые поля: заполненное в центре не перетирается (РМ135)', async () => {
    const world = makeWorld({
      learners: [
        {
          ...base,
          id: 'l_ivanov',
          firstName: 'Иван',
          lastName: 'Иванов',
          position: 'Главный инженер',
          externalId: '1001',
          sourceSystem: 'cdoprof'
        } as Learner
      ]
    });
    const { run } = await liveRun(world, { domain: 'learners' });
    const ivanov = world.state.learners.find((l) => l.id === 'l_ivanov')!;
    expect(ivanov.position).toBe('Главный инженер');
    expect(ivanov.dateOfBirth).toBe('1985-03-12');
    const row = (await world.store.listRows(TENANT, run.id, { limit: 50, offset: 0 })).items.find(
      (r) => r.sourceId === '1001'
    );
    expect(row).toMatchObject({ action: 'updated', targetId: 'l_ivanov' });
  });

  it('отказ одной записи не останавливает остальные: запуск «частично», причина словами', async () => {
    const world = makeWorld({
      counterparties: [
        { ...base, id: 'cp_taken', code: 'ИМП-101', name: 'Занятый код' } as Counterparty
      ]
    });
    const { run, task } = await liveRun(world);

    expect(run.status).toBe('partial');
    const failed = await world.store.listRows(TENANT, run.id, {
      action: 'failed',
      limit: 50,
      offset: 0
    });
    expect(failed.items.map((r) => r.sourceId)).toEqual(['101']);
    expect(failed.items[0]!.errorText).toBeTruthy();
    expect(world.state.counterparties).toHaveLength(4);
    /* Слушатели этой компании перенесены — без компании и с замечанием (РМ101). */
    const ivanov = world.state.learners.find((l) => l.externalId === '1001')!;
    expect(ivanov.counterpartyId).toBeUndefined();
    expect(task.errorText).toContain('Не перенесено строк: 1');
  });

  it('источник отказал посреди переноса — запуск и фоновая задача закрыты с причиной', async () => {
    const world = makeWorld();
    const broken = new CdoprofApiClient({ get: () => Promise.reject(new Error('таймаут')) });
    const { run, task } = await liveRun(world, { client: broken });
    expect(run).toMatchObject({ status: 'failed' });
    expect(run.errorText).toContain('таймаут');
    expect(task).toMatchObject({ status: 'failed' });
  });
});

describe('повтор ошибок и прерванные запуски', () => {
  const makeService = (world: ReturnType<typeof makeWorld>) => {
    const executor = { execute: vi.fn(async (_input: LiveRunInput) => undefined) };
    const service = new ImportCdoprofService(
      world.store,
      { clientFor: () => fixtureClient() },
      world.mvp,
      { write: vi.fn() } as unknown as AuditService,
      executor as unknown as ImportLiveExecutor,
      world.tasks
    );
    return { service, executor };
  };

  it('«Повторить только ошибки» берёт ровно отказавшие записи прошлого переноса', async () => {
    const world = makeWorld({
      counterparties: [
        { ...base, id: 'cp_taken', code: 'ИМП-101', name: 'Занятый код' } as Counterparty
      ]
    });
    const { run } = await liveRun(world);
    const { service, executor } = makeService(world);

    const retry = await service.retryFailed(TENANT, 'u_admin', run.id, ctx, TODAY);
    expect(retry).toMatchObject({ dryRun: false, stats: { retryOf: run.id } });
    const input = executor.execute.mock.calls[0]![0];
    expect([...input.only!]).toEqual(['counterparties:101']);
  });

  it('повторять нечего — отказ словами; сухой прогон не повторяется', async () => {
    const world = makeWorld();
    const { run } = await liveRun(world);
    const { service } = makeService(world);
    await expect(service.retryFailed(TENANT, 'u', run.id, ctx, TODAY)).rejects.toMatchObject({
      response: { code: 'import_nothing_to_retry' }
    });
    const dry = await service.startRun(
      TENANT,
      'u',
      { source: 'api', domain: 'counterparties', dryRun: true },
      ctx,
      TODAY
    );
    await expect(service.retryFailed(TENANT, 'u', dry.id, ctx, TODAY)).rejects.toMatchObject({
      response: { code: 'import_retry_dry_run' }
    });
  });

  it('боевой запуск отвечает сразу: запуск и фоновая задача заведены, перенос ушёл исполнителю', async () => {
    const world = makeWorld();
    const { service, executor } = makeService(world);
    const run = await service.startRun(
      TENANT,
      'u_admin',
      { source: 'api', domain: 'all', dryRun: false },
      ctx,
      TODAY
    );
    expect(run).toMatchObject({ dryRun: false, status: 'running' });
    expect(run.backgroundTaskId).toBeTruthy();
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect((await world.tasks.list(TENANT))[0]).toMatchObject({ kind: 'data_import' });
  });

  it('запуск, не отмечавшийся дольше порога, — прерванный: закрывается и не мешает новому', async () => {
    const store = new ImportRunsStore();
    const run = await store.createRun({
      tenantId: TENANT,
      source: 'api',
      domain: 'all',
      dryRun: false
    });
    expect(await store.hasRunning(TENANT)).toBe(true);
    const later = new Date(Date.now() + store.staleRunMs + 60_000);
    expect(await store.hasRunning(TENANT, later)).toBe(false);
    expect(await store.getRun(TENANT, run.id)).toMatchObject({ status: 'failed' });
    expect((await store.getRun(TENANT, run.id))!.errorText).toContain('прервался');
  });
});
