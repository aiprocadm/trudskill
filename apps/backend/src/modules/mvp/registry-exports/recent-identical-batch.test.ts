import { describe, expect, it } from 'vitest';

import { DOUBLE_SUBMIT_WINDOW_MS, findRecentIdenticalBatch } from './recent-identical-batch.js';

/**
 * Защита выгрузок в госреестры от двойной отправки.
 *
 * Проверяется ровно то, ради чего она сделана: двойной клик не создаёт второй подписанный
 * пакет, а осмысленная перевыгрузка — создаёт.
 */

const NOW = '2026-08-26T10:00:00.000Z';
const at = (offsetMs: number) => new Date(Date.parse(NOW) - offsetMs).toISOString();

const batch = (over: Partial<Parameters<typeof findRecentIdenticalBatch>[0][number]> = {}) => ({
  id: 'frb_1',
  tenantId: 't1',
  createdAt: at(5_000),
  generatedBy: 'u_1',
  sourceFilterJson: { from: '2026-01-01', to: '2026-06-30' },
  ...over
});

describe('двойное нажатие «Выгрузить»', () => {
  it('пакет, собранный пять секунд назад с тем же отбором, находится', () => {
    expect(
      findRecentIdenticalBatch([batch()], {
        tenantId: 't1',
        filter: { from: '2026-01-01', to: '2026-06-30' },
        actorId: 'u_1',
        nowIso: NOW
      })?.id
    ).toBe('frb_1');
  });

  it('порядок ключей в отборе не важен — это тот же запрос', () => {
    expect(
      findRecentIdenticalBatch([batch()], {
        tenantId: 't1',
        filter: { to: '2026-06-30', from: '2026-01-01' },
        actorId: 'u_1',
        nowIso: NOW
      })
    ).toBeTruthy();
  });
});

describe('осмысленная работа не блокируется', () => {
  it('пакет старше окна не мешает собрать новый', () => {
    expect(
      findRecentIdenticalBatch([batch({ createdAt: at(DOUBLE_SUBMIT_WINDOW_MS + 1_000) })], {
        tenantId: 't1',
        filter: { from: '2026-01-01', to: '2026-06-30' },
        actorId: 'u_1',
        nowIso: NOW
      })
    ).toBeUndefined();
  });

  it('другой отбор собирается сразу', () => {
    expect(
      findRecentIdenticalBatch([batch()], {
        tenantId: 't1',
        filter: { from: '2026-07-01', to: '2026-12-31' },
        actorId: 'u_1',
        nowIso: NOW
      })
    ).toBeUndefined();
  });

  it('другой сотрудник не упирается в чужую выгрузку', () => {
    expect(
      findRecentIdenticalBatch([batch()], {
        tenantId: 't1',
        filter: { from: '2026-01-01', to: '2026-06-30' },
        actorId: 'u_2',
        nowIso: NOW
      })
    ).toBeUndefined();
  });

  it('соседний учебный центр не виден вовсе', () => {
    expect(
      findRecentIdenticalBatch([batch({ tenantId: 't2' })], {
        tenantId: 't1',
        filter: { from: '2026-01-01', to: '2026-06-30' },
        actorId: 'u_1',
        nowIso: NOW
      })
    ).toBeUndefined();
  });
});

describe('крайние случаи', () => {
  it('пустой список пакетов не ломает разбор', () => {
    expect(
      findRecentIdenticalBatch([], {
        tenantId: 't1',
        filter: {},
        actorId: 'u_1',
        nowIso: NOW
      })
    ).toBeUndefined();
  });

  it('битая дата «сейчас» не приводит к ложному совпадению', () => {
    expect(
      findRecentIdenticalBatch([batch()], {
        tenantId: 't1',
        filter: { from: '2026-01-01', to: '2026-06-30' },
        actorId: 'u_1',
        nowIso: 'не дата'
      })
    ).toBeUndefined();
  });

  it('пакет из будущего не считается недавним', () => {
    expect(
      findRecentIdenticalBatch([batch({ createdAt: at(-10_000) })], {
        tenantId: 't1',
        filter: { from: '2026-01-01', to: '2026-06-30' },
        actorId: 'u_1',
        nowIso: NOW
      })
    ).toBeUndefined();
  });

  it('находится САМЫЙ СВЕЖИЙ подходящий пакет, а не первый попавшийся', () => {
    const older = batch({ id: 'frb_old', createdAt: at(30_000) });
    const newer = batch({ id: 'frb_new', createdAt: at(2_000) });
    expect(
      findRecentIdenticalBatch([older, newer], {
        tenantId: 't1',
        filter: { from: '2026-01-01', to: '2026-06-30' },
        actorId: 'u_1',
        nowIso: NOW
      })?.id
    ).toBe('frb_new');
  });
});
