import { describe, expect, it, vi } from 'vitest';

import { IdentityRetentionScanner } from './identity-retention-scanner.service.js';
import { TENANT_IDENTITY_SETTINGS_KEY } from '../../tenant/tenant-identity-settings.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { AuditService } from '../../audit/audit.service.js';
import type { FilesService } from '../../files/files.service.js';
import type { TenantService } from '../../tenant/tenant.service.js';

/**
 * ФТ-C3.1 (Фаза 3 Task 7): срок хранения снимков задаёт сам центр.
 * `retentionDays === undefined` — центр ничего не настраивал, работает умолчание.
 */
function makeScanner(retentionDays?: number | 'broken' | 'unreadable') {
  const deleteFile = vi.fn(async () => undefined);
  const auditWrite = vi.fn();
  const getRequisites = vi.fn(async () => {
    if (retentionDays === 'unreadable') throw new Error('db down');
    return {
      tenantId: 't1',
      legalName: 'ООО Демо',
      taxNumber: '7700000000',
      payload:
        retentionDays === undefined
          ? {}
          : {
              [TENANT_IDENTITY_SETTINGS_KEY]: {
                imageRetentionDays: retentionDays === 'broken' ? 'тридцать' : retentionDays
              }
            }
    };
  });
  const scanner = new IdentityRetentionScanner(
    { deleteFile } as unknown as FilesService,
    { write: auditWrite } as unknown as AuditService,
    { getRequisites } as unknown as TenantService
  );
  return { scanner, deleteFile, auditWrite, getRequisites };
}

function seedState(reviewedAt: string) {
  const state = new InMemoryMvpState();
  state.identityVerifications.push({
    id: 'idv_1',
    tenantId: 't1',
    learnerId: 'l1',
    method: 'selfie_passport',
    verificationStatus: 'approved',
    selfieFileId: 'f_s',
    passportFileId: 'f_p',
    reviewedAt,
    status: 'active',
    createdAt: reviewedAt,
    updatedAt: reviewedAt
  });
  return state;
}

describe('IdentityRetentionScanner', () => {
  it('purges both images, stamps imagesPurgedAt, audits', async () => {
    const { scanner, deleteFile, auditWrite } = makeScanner();
    const state = seedState('2026-01-01T00:00:00.000Z');
    const purged = await scanner.scanTenant('t1', '2026-06-01', state);
    expect(purged).toBe(1);
    expect(deleteFile).toHaveBeenCalledWith('t1', 'f_s');
    expect(deleteFile).toHaveBeenCalledWith('t1', 'f_p');
    expect(state.identityVerifications[0]!.imagesPurgedAt).toBeTruthy();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.identity_verification_images_purged' })
    );
  });

  it('does nothing inside the retention window and never double-purges', async () => {
    const { scanner, deleteFile } = makeScanner();
    const state = seedState(new Date().toISOString());
    expect(await scanner.scanTenant('t1', new Date().toISOString().slice(0, 10), state)).toBe(0);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('one failing record does not abort the batch', async () => {
    const { scanner, deleteFile } = makeScanner();
    deleteFile.mockRejectedValueOnce(new Error('s3 down'));
    const state = seedState('2026-01-01T00:00:00.000Z');
    state.identityVerifications.push({
      ...state.identityVerifications[0]!,
      id: 'idv_2',
      selfieFileId: 'f_s2',
      passportFileId: 'f_p2'
    });
    const purged = await scanner.scanTenant('t1', '2026-06-01', state);
    expect(purged).toBe(1); // first failed, second succeeded
    expect(state.identityVerifications[0]!.imagesPurgedAt).toBeUndefined();
    expect(state.identityVerifications[1]!.imagesPurgedAt).toBeTruthy();
  });
});

describe('срок хранения задаёт центр (ФТ-C3.1, Фаза 3 Task 7)', () => {
  const REVIEWED = '2026-01-01T00:00:00.000Z';

  it('срок 30 дней чистит раньше, чем прежние 90', async () => {
    const { scanner, deleteFile } = makeScanner(30);
    // 45 дней после решения: при умолчании 90 снимки бы ещё жили.
    expect(await scanner.scanTenant('t1', '2026-02-15', seedState(REVIEWED))).toBe(1);
    expect(deleteFile).toHaveBeenCalled();
  });

  it('при умолчании те же 45 дней ещё НЕ повод удалять', async () => {
    const { scanner, deleteFile } = makeScanner();
    expect(await scanner.scanTenant('t1', '2026-02-15', seedState(REVIEWED))).toBe(0);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('увеличенный срок откладывает удаление', async () => {
    const { scanner } = makeScanner(365);
    expect(await scanner.scanTenant('t1', '2026-06-01', seedState(REVIEWED))).toBe(0);
  });

  it('мусорное значение откатывается к умолчанию, а очистка продолжает работать', async () => {
    const { scanner } = makeScanner('broken');
    // 150 дней — больше умолчания: удаление всё равно происходит.
    expect(await scanner.scanTenant('t1', '2026-06-01', seedState(REVIEWED))).toBe(1);
  });

  it('нечитаемые реквизиты не останавливают удаление ПДн', async () => {
    // Сбой чтения настроек не имеет права оставить паспорта в хранилище навсегда.
    const { scanner } = makeScanner('unreadable');
    expect(await scanner.scanTenant('t1', '2026-06-01', seedState(REVIEWED))).toBe(1);
  });

  it('РЕШЕНИЕ МОДЕРАТОРА переживает удаление снимков', async () => {
    // Снимок можно стереть, доказательство проверки личности — нет.
    const { scanner } = makeScanner(30);
    const state = seedState(REVIEWED);
    await scanner.scanTenant('t1', '2026-06-01', state);

    const record = state.identityVerifications[0]!;
    expect(record.verificationStatus).toBe('approved');
    expect(record.reviewedAt).toBe(REVIEWED);
    expect(record.imagesPurgedAt).toBeTruthy();
  });
});
