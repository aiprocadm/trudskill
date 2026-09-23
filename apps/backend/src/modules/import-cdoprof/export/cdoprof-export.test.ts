import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EXPORT_FILES, profileColumns, runCdoprofExport } from './cdoprof-export.js';
import { FsExportSink } from './fs-export-sink.js';
import { CdoprofApiClient } from '../sources/cdoprof-api-client.js';
import { CdoprofApiError } from '../sources/cdoprof-transport.js';
import {
  FixtureCdoprofTransport,
  loadFixtureDataset
} from '../sources/fixture-cdoprof-transport.js';

import type { ExportSink } from './cdoprof-export.js';
import type { CdoprofQuery, CdoprofTransport } from '../sources/cdoprof-transport.js';

class MemorySink implements ExportSink {
  readonly files = new Map<string, unknown>();

  async write(name: string, payload: unknown): Promise<void> {
    this.files.set(name, JSON.parse(JSON.stringify(payload)));
  }
}

const dataset = loadFixtureDataset();

describe('runCdoprofExport', () => {
  it('пишет все файлы, счётчики совпадают с источником', async () => {
    const sink = new MemorySink();
    const client = new CdoprofApiClient(new FixtureCdoprofTransport(dataset), { pageLimit: 3 });

    const manifest = await runCdoprofExport(client, sink, {
      now: () => new Date('2026-09-23T10:00:00Z')
    });

    expect([...sink.files.keys()].sort()).toEqual(Object.values(EXPORT_FILES).sort());
    expect(manifest.entities.contragents?.count).toBe(dataset.contragents.length);
    expect(manifest.entities.students?.count).toBe(dataset.students.length);
    expect(manifest.entities.parentCourses?.count).toBe(dataset.parentCourses.length);
    expect(manifest.entities.courses?.count).toBe(dataset.courses.length);
    expect(manifest.entities.groups?.count).toBe(dataset.groups.length);
    expect(manifest.trainings).toEqual({ requested: 4, exported: 4, failed: [] });
    expect(manifest.exportedAt).toBe('2026-09-23T10:00:00.000Z');
    expect(sink.files.get(EXPORT_FILES.manifest)).toEqual(manifest);
    expect((sink.files.get(EXPORT_FILES.trainings) as unknown[]).length).toBe(4);
  });

  it('профиль колонок считает заполненность и строку «undefined»', async () => {
    const sink = new MemorySink();
    const client = new CdoprofApiClient(new FixtureCdoprofTransport(dataset));

    const manifest = await runCdoprofExport(client, sink, { withTrainings: false });

    expect(manifest.entities.students?.columns.dolznost).toEqual({
      filled: 7,
      empty: 1,
      undefinedStrings: 1
    });
    expect(manifest.entities.contragents?.columns.inn).toEqual({
      filled: 3,
      empty: 1,
      undefinedStrings: 0
    });
    expect(manifest.entities.groups?.columns.name_group?.empty).toBe(1);
  });

  it('отказ обучений по одному контрагенту не останавливает остальные', async () => {
    const inner = new FixtureCdoprofTransport(dataset);
    const flaky: CdoprofTransport = {
      async get(method: string, query: CdoprofQuery = {}) {
        if (method === 'contragent.students.trainings' && Number(query.contragent_id) === 102) {
          throw new CdoprofApiError('http_error', 'CDOPROF ответил HTTP 502', 502);
        }
        return inner.get(method, query);
      }
    };
    const sink = new MemorySink();
    const client = new CdoprofApiClient(flaky);

    const manifest = await runCdoprofExport(client, sink);

    expect(manifest.trainings.requested).toBe(4);
    expect(manifest.trainings.exported).toBe(3);
    expect(manifest.trainings.failed).toEqual([
      { contragentId: 102, reason: 'CDOPROF ответил HTTP 502' }
    ]);
    expect(manifest.warnings).toHaveLength(1);
    expect(manifest.warnings[0]).toContain('102');
    expect((sink.files.get(EXPORT_FILES.trainings) as unknown[]).length).toBe(3);
  });

  it('withTrainings: false — обучения не запрашиваются и файла нет', async () => {
    const transport = new FixtureCdoprofTransport(dataset);
    const sink = new MemorySink();

    const manifest = await runCdoprofExport(new CdoprofApiClient(transport), sink, {
      withTrainings: false
    });

    expect(transport.calls.some((c) => c.method === 'contragent.students.trainings')).toBe(false);
    expect(sink.files.has(EXPORT_FILES.trainings)).toBe(false);
    expect(manifest.trainings).toEqual({ requested: 0, exported: 0, failed: [] });
  });

  it('в манифесте нет ни одного значения из данных — только числа и имена колонок', async () => {
    const sink = new MemorySink();
    const client = new CdoprofApiClient(new FixtureCdoprofTransport(dataset));

    const manifest = await runCdoprofExport(client, sink);
    const text = JSON.stringify(manifest);

    for (const student of dataset.students) {
      expect(text).not.toContain(String(student.full_name));
      if (student.email) expect(text).not.toContain(String(student.email));
    }
    for (const contragent of dataset.contragents) {
      if (contragent.inn) expect(text).not.toContain(String(contragent.inn));
    }
  });
});

describe('profileColumns', () => {
  it('объединяет колонки всех строк и считает пустые строки пробелов как пустые', () => {
    const profile = profileColumns([
      { a: 1, b: '  ' },
      { a: null, c: 'undefined' }
    ]);

    expect(profile).toEqual({
      a: { filled: 1, empty: 1, undefinedStrings: 0 },
      b: { filled: 0, empty: 2, undefinedStrings: 0 },
      c: { filled: 1, empty: 1, undefinedStrings: 1 }
    });
  });
});

describe('FsExportSink', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('создаёт папку 0700 и файлы 0600 с JSON', async () => {
    dir = join(await mkdtemp(join(tmpdir(), 'cdoprof-sink-')), 'out');
    const sink = new FsExportSink(dir);

    await sink.write('a.json', { x: 1 });
    await sink.write('b.json', [1, 2]);

    expect((await readdir(dir)).sort()).toEqual(['a.json', 'b.json']);
    expect(JSON.parse(await readFile(join(dir, 'a.json'), 'utf8'))).toEqual({ x: 1 });
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, 'a.json'))).mode & 0o777).toBe(0o600);
  });
});
