import { describe, expect, it, vi } from 'vitest';

import { InMemoryLookupRepository } from './in-memory-lookup.repository.js';
import { LookupService, normalizePositionName, uniquePositionNames } from './lookup.service.js';

import type { AuditService } from '../audit/audit.service.js';

/** Справочники личного дела (МГ-C1.2, РМ80–РМ82). */
const T = 'tenant_demo';

const makeService = () => {
  const audit = { write: vi.fn() };
  const repo = new InMemoryLookupRepository();
  return { service: new LookupService(repo, audit as unknown as AuditService), audit, repo };
};

describe('normalizePositionName (РМ80)', () => {
  it('схлопывает пробелы; целиком ЗАГЛАВНЫЕ становятся предложением; смешанный регистр — как ввели', () => {
    expect(normalizePositionName('  инженер   по  охране труда ')).toBe('инженер по охране труда');
    expect(normalizePositionName('ИНЖЕНЕР ПО ОХРАНЕ ТРУДА')).toBe('Инженер по охране труда');
    expect(normalizePositionName('Главный Инженер')).toBe('Главный Инженер');
    expect(normalizePositionName('IT-специалист')).toBe('IT-специалист');
    expect(normalizePositionName('   ')).toBe('');
  });

  it('пачка: пустые пропускаются, дубли без учёта регистра схлопываются в первое написание', () => {
    expect(
      uniquePositionNames(['ИНЖЕНЕР', 'инженер ', 'Инженер', '', undefined, 'мастер'])
    ).toEqual(['Инженер', 'мастер']);
  });
});

describe('LookupService', () => {
  it('rememberPositions дописывает только новые и пишет аудит; повтор ничего не добавляет', async () => {
    const { service, audit } = makeService();
    const first = await service.rememberPositions(T, ['ИНЖЕНЕР', 'мастер'], 'u1');
    expect(first).toEqual({ added: 2, names: ['Инженер', 'мастер'] });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lookup.positions_added', tenantId: T })
    );

    const again = await service.rememberPositions(T, ['инженер', 'Мастер'], 'u1');
    expect(again.added).toBe(0);
    expect(audit.write).toHaveBeenCalledTimes(1);
  });

  it('пустая должность из импорта — ничего не создаёт и не падает', async () => {
    const { service, audit } = makeService();
    expect(await service.rememberPositions(T, ['', undefined, null])).toEqual({
      added: 0,
      names: []
    });
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('подсказки — по вхождению без учёта регистра и только своего центра', async () => {
    const { service } = makeService();
    await service.rememberPositions(T, [
      'Инженер по охране труда',
      'Мастер участка',
      'Электромонтёр'
    ]);
    await service.rememberPositions('tenant_other', ['Инженер-программист']);
    const hits = await service.listPositions(T, 'ИНЖ');
    expect(hits.map((row) => row.name)).toEqual(['Инженер по охране труда']);
    expect((await service.listPositions(T)).map((row) => row.name)).toEqual([
      'Инженер по охране труда',
      'Мастер участка',
      'Электромонтёр'
    ]);
  });

  it('уровни образования — фиксированный список ФРДО по-русски; страны — Россия первой', async () => {
    const { service } = makeService();
    const levels = await service.listEducationLevels();
    expect(levels.map((row) => row.code)).toContain('higher_bachelor');
    expect(levels.every((row) => /^[А-Яа-яЁё —,]+$/.test(row.name))).toBe(true);
    const countries = await service.listCountries();
    expect(countries[0]).toMatchObject({ code: 'RU', name: 'Россия' });
    expect(countries.length).toBeGreaterThanOrEqual(20);
  });

  it('rememberPositionsSafely глотает отказ справочника — импорт из-за него не падает', async () => {
    const audit = { write: vi.fn() };
    const broken = {
      rememberPositions: vi.fn(async () => {
        throw new Error('db down');
      })
    };
    const service = new LookupService(broken as never, audit as unknown as AuditService);
    await expect(service.rememberPositionsSafely(T, ['Инженер'])).resolves.toBeUndefined();
  });
});
