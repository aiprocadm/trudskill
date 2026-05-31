import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

function makeServices(): { service: MvpService } {
  const service = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
  return { service };
}

describe('listOtTrainingPrograms', () => {
  it('returns seeded ОТ programs from lookup', () => {
    const { service } = makeServices();
    const programs = service.listOtTrainingPrograms();
    expect(programs.length).toBeGreaterThanOrEqual(5);
    expect(programs.find((p) => p.programKind === 'first_aid')).toBeTruthy();
  });

  it('returns only active programs', () => {
    const { service } = makeServices();
    const programs = service.listOtTrainingPrograms();
    expect(programs.every((p) => p.isActive)).toBe(true);
  });

  it('returns programs sorted by registryId ascending', () => {
    const { service } = makeServices();
    const programs = service.listOtTrainingPrograms();
    const ids = programs.map((p) => p.registryId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('includes all 5 seed programs with correct codes', () => {
    const { service } = makeServices();
    const programs = service.listOtTrainingPrograms();
    const codes = programs.map((p) => p.code);
    expect(codes).toContain('OT_A');
    expect(codes).toContain('OT_B');
    expect(codes).toContain('OT_V');
    expect(codes).toContain('OT_FIRST_AID');
    expect(codes).toContain('OT_SIZ');
  });
});
