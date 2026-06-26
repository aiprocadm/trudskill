import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;
const noopFilesService = { ensureMaterialLink: async () => undefined } as unknown as FilesService;

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 't1',
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeMvp(): { mvp: MvpService; state: InMemoryMvpState } {
  const state = new InMemoryMvpState();
  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
  return { mvp, state };
}

describe('MvpService notification staff recipients', () => {
  it('returns an empty list when none configured (opt-in default)', () => {
    const { mvp } = makeMvp();
    expect(mvp.getNotificationStaffRecipients('t1')).toEqual([]);
  });

  it('sets, normalizes (trim+lowercase) and dedupes the tenant list', () => {
    const { mvp } = makeMvp();
    const result = mvp.setNotificationStaffRecipients(
      't1',
      'u_admin',
      ['  Admin@UC.ru ', 'curator@uc.ru', 'admin@uc.ru', '   '],
      ctx
    );
    expect(result).toEqual(['admin@uc.ru', 'curator@uc.ru']);
    expect(mvp.getNotificationStaffRecipients('t1')).toEqual(['admin@uc.ru', 'curator@uc.ru']);
  });

  it('replaces the tenant list on a subsequent set (not append)', () => {
    const { mvp } = makeMvp();
    mvp.setNotificationStaffRecipients('t1', 'u_admin', ['a@uc.ru', 'b@uc.ru'], ctx);
    mvp.setNotificationStaffRecipients('t1', 'u_admin', ['c@uc.ru'], ctx);
    expect(mvp.getNotificationStaffRecipients('t1')).toEqual(['c@uc.ru']);
  });

  it('clears the list when set with an empty array', () => {
    const { mvp } = makeMvp();
    mvp.setNotificationStaffRecipients('t1', 'u_admin', ['a@uc.ru'], ctx);
    expect(mvp.setNotificationStaffRecipients('t1', 'u_admin', [], ctx)).toEqual([]);
    expect(mvp.getNotificationStaffRecipients('t1')).toEqual([]);
  });

  it('does not leak recipients across tenants', () => {
    const { mvp } = makeMvp();
    mvp.setNotificationStaffRecipients('t1', 'u_admin', ['t1@uc.ru'], ctx);
    mvp.setNotificationStaffRecipients('t2', 'u_admin', ['t2@uc.ru'], { ...ctx, tenantId: 't2' });
    expect(mvp.getNotificationStaffRecipients('t1')).toEqual(['t1@uc.ru']);
    expect(mvp.getNotificationStaffRecipients('t2')).toEqual(['t2@uc.ru']);
  });
});
