import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ConsentService } from './consent.service.js';
import { InMemoryConsentRepository } from './in-memory-consent.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryLearnerFilesRepository } from '../learners/learner-files.repository.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { LegalLogWriter } from '../esignature/legal-log.writer.js';

const T = 'tenant_demo';
const ctx: RequestContext = {
  requestId: 'r0',
  correlationId: 'c0',
  tenantId: T,
  userId: 'u_curator',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const make = () => {
  const repo = new InMemoryConsentRepository();
  const entries: Array<{ eventType: string; description: string }> = [];
  const legalLog = {
    write: async (entry: { eventType: string; description: string }) => {
      entries.push(entry);
    }
  } as unknown as LegalLogWriter;
  const audit = new AuditService();
  const files = new InMemoryLearnerFilesRepository();
  files.registerFile(T, {
    fileId: 'file_scan',
    name: 'согласие.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    antivirusStatus: 'clean'
  });
  const service = new ConsentService(repo, legalLog, audit, files);
  return { service, repo, entries, audit, files };
};

/** Бумажное согласие, отмеченное сотрудником (МГ-C5.1, срез 12.1, РМ109–РМ111). */
describe('ConsentService.markPaper', () => {
  it('отмечает бумажное согласие датой подписи, источником, сотрудником и сканом из личного дела', async () => {
    const { service, entries, audit, files } = make();
    await files.attach(T, 'l_1', 'file_scan');
    const state = await service.markPaper(
      T,
      'l_1',
      'personal_data',
      { signedAt: '2026-03-01', fileId: 'file_scan' },
      ctx
    );
    expect(state.granted).toBe(true);
    expect(state.grantedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(state.source).toBe('paper');
    expect(state.evidenceFileId).toBe('file_scan');
    expect(entries[0]?.eventType).toBe('consent.personal_data_granted');
    expect(entries[0]?.description).toContain('Бумажное');
    const record = (await audit.listPage(T, { action: 'learning.consent_paper_marked' })).items[0];
    expect(record?.entityId).toBe('l_1');
    expect(record?.newValues).toMatchObject({ kind: 'personal_data', signedAt: '2026-03-01' });
  });

  it('уже действующее согласие не дублируется; кривая дата и чужой файл — понятные отказы', async () => {
    const { service, repo } = make();
    const first = await service.markPaper(
      T,
      'l_1',
      'personal_data',
      { signedAt: '2026-03-01' },
      ctx
    );
    const second = await service.markPaper(
      T,
      'l_1',
      'personal_data',
      { signedAt: '2026-04-01' },
      ctx
    );
    expect(second.grantedAt).toBe(first.grantedAt);
    expect((await repo.findLatestFact(T, 'l_1', 'personal_data'))?.source).toBe('paper');
    await expect(
      service.markPaper(T, 'l_2', 'personal_data', { signedAt: '01.03.2026' }, ctx)
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.markPaper(T, 'l_2', 'personal_data', { signedAt: '2030-01-01' }, ctx)
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.markPaper(
        T,
        'l_2',
        'personal_data',
        { signedAt: '2026-03-01', fileId: 'file_scan' },
        ctx
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('после отзыва бумажное согласие можно отметить заново — новым фактом', async () => {
    const { service } = make();
    await service.markPaper(T, 'l_1', 'photo', { signedAt: '2026-03-01' }, ctx);
    await service.revoke(T, 'l_1', 'photo', ctx);
    const again = await service.markPaper(T, 'l_1', 'photo', { signedAt: '2026-05-01' }, ctx);
    expect(again.granted).toBe(true);
    expect(again.grantedAt).toBe('2026-05-01T00:00:00.000Z');
  });
});
