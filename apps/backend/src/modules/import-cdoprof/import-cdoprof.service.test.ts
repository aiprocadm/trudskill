import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { envCdoprofSource } from './cdoprof-source.js';
import { ImportCdoprofService } from './import-cdoprof.service.js';
import { ImportRunsStore } from './import-runs.store.js';
import { ImportRowsQuery, StartImportRunRequest } from './import.request-dto.js';
import { mapContragent, mapStudent } from './mappers.js';
import { BackgroundTasksService } from '../background-tasks/background-tasks.service.js';
import { CdoprofApiClient } from './sources/cdoprof-api-client.js';
import {
  FixtureCdoprofTransport,
  loadFixtureDataset
} from './sources/fixture-cdoprof-transport.js';

import type { CdoprofSourceFactory } from './cdoprof-source.js';
import type { MatchSnapshot } from './dedup.js';
import type { ImportLiveExecutor } from './import-live.executor.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { MvpService } from '../mvp/mvp.service.js';
import type { Counterparty, Learner } from '../mvp/mvp.types.js';
import type { CdoprofContragent } from './sources/cdoprof-api.schemas.js';

const TENANT = 'tenant_a';
const TODAY = new Date('2026-09-30T12:00:00Z');
const ctx = {
  tenantId: TENANT,
  userId: 'u_admin',
  requestId: 'r',
  correlationId: 'c'
} as RequestContext;

const base = { tenantId: TENANT, status: 'active', createdAt: '', updatedAt: '' };
const learner = (patch: Partial<Learner>): Learner =>
  ({ ...base, id: 'l_x', firstName: 'Имя', lastName: 'Фамилия', ...patch }) as Learner;
const counterparty = (patch: Partial<Counterparty>): Counterparty =>
  ({ ...base, id: 'cp_x', code: 'X', name: 'X', ...patch }) as Counterparty;

const fixtureSource = (): CdoprofSourceFactory => ({
  clientFor: () => new CdoprofApiClient(new FixtureCdoprofTransport(loadFixtureDataset()))
});

const makeService = (options: { snapshot?: MatchSnapshot; source?: CdoprofSourceFactory } = {}) => {
  const snapshot = options.snapshot ?? { learners: [], counterparties: [] };
  const mvp = { importMatchSnapshot: vi.fn(() => snapshot) } as unknown as MvpService;
  const audit = { write: vi.fn() } as unknown as AuditService;
  const store = new ImportRunsStore();
  const executor = { execute: vi.fn(async () => undefined) } as unknown as ImportLiveExecutor;
  const service = new ImportCdoprofService(
    store,
    options.source ?? fixtureSource(),
    mvp,
    audit,
    executor,
    new BackgroundTasksService()
  );
  return { service, store, audit, snapshot };
};

const dryRun = (domain: StartImportRunRequest['domain']): StartImportRunRequest => ({
  source: 'api',
  domain,
  dryRun: true
});

describe('разбор записей CDOPROF (МГ-K3.1, срез 23.1)', () => {
  const students = loadFixtureDataset().students as unknown as Parameters<typeof mapStudent>[0][];
  const byId = (id: number) => mapStudent(students.find((s) => s.id === id)!, TODAY);

  it('дата 2109-12-01 не переносится, а попадает в отчёт; «undefined» — не должность', () => {
    const mapped = byId(1004);
    expect(mapped.draft).toMatchObject({ lastName: 'Петров-Водкин', firstName: 'Кузьма' });
    expect(mapped.draft?.dateOfBirth).toBeUndefined();
    expect(mapped.draft?.position).toBeUndefined();
    expect(mapped.notes.map((n) => n.code)).toEqual(['learner_birth_date_dropped']);
  });

  it('в выжимке строки нет ФИО целиком — только фамилия с инициалами (ТЗ §17)', () => {
    expect(byId(1001).raw).toEqual({ name: 'Иванов И. И.', counterpartySourceId: '101' });
  });

  it('ИНН не той длины — строка непереносима; неверная контрольная сумма — замечание', () => {
    const bad = mapContragent({
      id: 9,
      inn: '77-01',
      name_organiztion: 'ООО «Ошибка»'
    } as CdoprofContragent);
    expect(bad.error?.code).toBe('counterparty_inn_malformed');
    const checksum = mapContragent({
      id: 10,
      inn: '7700000001',
      short_name: 'Пример'
    } as CdoprofContragent);
    expect(checksum.draft?.inn).toBe('7700000001');
    expect(checksum.notes.map((n) => n.code)).toEqual(['counterparty_inn_checksum']);
  });
});

describe('сухой прогон импорта (МГ-K3.1/K3.2, срез 23.1)', () => {
  it('ничего не создаёт в центре, пишет отчёт: дубль через ё/е — кандидат на слияние', async () => {
    const { service, store, snapshot } = makeService();
    const run = await service.startRun(TENANT, 'u_admin', dryRun('all'), ctx, TODAY);

    expect(snapshot.learners).toHaveLength(0);
    expect(snapshot.counterparties).toHaveLength(0);
    expect(run.status).toBe('succeeded');
    expect(run.stats.byDomain.counterparties).toMatchObject({ total: 4, created: 4 });
    expect(run.stats.byDomain.learners).toMatchObject({
      total: 8,
      created: 7,
      skipped: 1,
      mergeCandidates: 1
    });

    const candidates = await store.listRows(TENANT, run.id, {
      errorCode: 'merge_candidate',
      limit: 10,
      offset: 0
    });
    expect(candidates.items).toHaveLength(1);
    expect(candidates.items[0]).toMatchObject({ sourceId: '1003', action: 'skipped' });
    expect(candidates.items[0]!.errorText).toContain('№ 1002');
  });

  it('внешний ID и ИНН+КПП сопоставляют сами, ФИО+дата рождения — только кандидат', async () => {
    const { service, store } = makeService({
      snapshot: {
        learners: [
          learner({ id: 'l_ivanov', externalId: '1001', sourceSystem: 'cdoprof' }),
          learner({
            id: 'l_kuz',
            lastName: 'Кузнецов',
            firstName: 'Петр',
            middleName: 'Алексеевич',
            dateOfBirth: '1978-11-30'
          })
        ],
        counterparties: [counterparty({ id: 'cp_filial', inn: '7700000002', kpp: '770002002' })]
      }
    });
    const run = await service.startRun(TENANT, 'u_admin', dryRun('all'), ctx, TODAY);
    const rows = (await store.listRows(TENANT, run.id, { limit: 50, offset: 0 })).items;
    const row = (sourceId: string) => rows.find((r) => r.sourceId === sourceId)!;

    expect(row('1001')).toMatchObject({ action: 'updated', targetId: 'l_ivanov' });
    expect(row('104')).toMatchObject({ action: 'updated', targetId: 'cp_filial' });
    expect(row('1006')).toMatchObject({
      action: 'skipped',
      targetId: 'l_kuz',
      errorCode: 'merge_candidate'
    });
  });

  it('слушатели без своих компаний — переносятся с замечанием (РМ101)', async () => {
    const { service, store } = makeService();
    const run = await service.startRun(TENANT, 'u_admin', dryRun('learners'), ctx, TODAY);
    const ivanov = (await store.listRows(TENANT, run.id, { limit: 50, offset: 0 })).items.find(
      (r) => r.sourceId === '1001'
    );
    expect(ivanov).toMatchObject({
      action: 'created',
      errorCode: 'learner_counterparty_not_imported'
    });
    expect(run.stats.withNotes).toBeGreaterThan(0);
  });

  it('отказы словами: нет источника, перенос уже идёт', async () => {
    const { service, store } = makeService();
    const unconfigured = makeService({ source: { clientFor: () => null } });
    await expect(
      unconfigured.service.startRun(TENANT, 'u', dryRun('all'), ctx, TODAY)
    ).rejects.toMatchObject({ response: { code: 'import_source_not_configured' } });

    await store.createRun({ tenantId: TENANT, source: 'api', domain: 'all', dryRun: true });
    await expect(service.startRun(TENANT, 'u', dryRun('all'), ctx, TODAY)).rejects.toMatchObject({
      response: { code: 'import_already_running' }
    });
  });

  it('источник упал — запуск остаётся в истории с причиной, а не пропадает', async () => {
    const broken: CdoprofSourceFactory = {
      clientFor: () =>
        new CdoprofApiClient({
          get: () => Promise.reject(new Error('таймаут'))
        })
    };
    const { service } = makeService({ source: broken });
    const run = await service.startRun(TENANT, 'u', dryRun('learners'), ctx, TODAY);
    expect(run.status).toBe('failed');
    expect(run.errorText).toContain('таймаут');
    expect((await service.getRun(TENANT, run.id)).status).toBe('failed');
  });

  it('запуск чужого центра не виден: 404, а не чужой отчёт', async () => {
    const { service } = makeService();
    const run = await service.startRun(TENANT, 'u', dryRun('counterparties'), ctx, TODAY);
    await expect(service.getRun('tenant_b', run.id)).rejects.toMatchObject({
      response: { code: 'import_run_not_found' }
    });
    await expect(service.listRows('tenant_b', run.id, {})).rejects.toMatchObject({
      response: { code: 'import_run_not_found' }
    });
    expect(await service.listRuns('tenant_b')).toEqual([]);
  });
});

describe('источник CDOPROF привязан к одному центру (РМ134)', () => {
  const env = {
    CDOPROF_API_BASE_URL: 'https://example.invalid',
    CDOPROF_API_KEY: 'k',
    CDOPROF_IMPORT_TENANT_ID: TENANT
  };

  it('ключ отдаётся только своему центру; без привязки — никому', () => {
    expect(envCdoprofSource(env).clientFor(TENANT)).toBeInstanceOf(CdoprofApiClient);
    expect(envCdoprofSource(env).clientFor('tenant_b')).toBeNull();
    expect(envCdoprofSource({ ...env, CDOPROF_IMPORT_TENANT_ID: '' }).clientFor(TENANT)).toBeNull();
    expect(envCdoprofSource({ ...env, CDOPROF_API_KEY: '' }).clientFor(TENANT)).toBeNull();
  });
});

describe('запрос запуска и отчёта', () => {
  const errorsOf = <T extends object>(cls: new () => T, raw: object) =>
    validateSync(plainToInstance(cls, raw)).map((e) => e.property);

  it('источник, домен и признак сухого прогона обязательны; xlsx — позже (срез 23.4)', () => {
    expect(errorsOf(StartImportRunRequest, { source: 'api', domain: 'all', dryRun: true })).toEqual(
      []
    );
    expect(
      errorsOf(StartImportRunRequest, { source: 'xlsx', domain: 'all', dryRun: true })
    ).toEqual(['source']);
    expect(
      errorsOf(StartImportRunRequest, { source: 'api', domain: 'groups', dryRun: true })
    ).toEqual(['domain']);
    expect(errorsOf(StartImportRunRequest, { source: 'api', domain: 'all' })).toEqual(['dryRun']);
  });

  it('отбор строк: действие, код и страница из строки запроса', () => {
    expect(
      errorsOf(ImportRowsQuery, {
        action: 'skipped',
        errorCode: 'merge_candidate',
        limit: '50',
        offset: '0'
      })
    ).toEqual([]);
    expect(errorsOf(ImportRowsQuery, { action: 'deleted' })).toEqual(['action']);
    expect(errorsOf(ImportRowsQuery, { limit: '5000' })).toEqual(['limit']);
  });
});
