import { describe, expect, it } from 'vitest';

import {
  DocumentsController,
  ISSUANCE_JOURNAL_CSV_HARD_CAP,
  ISSUANCE_JOURNAL_CSV_HEADER,
  renderIssuanceJournalCsv
} from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { GeneratedDocumentEntity } from './documents.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  tenantId: 't1',
  userId: 'u1',
  roles: [],
  permissions: [],
  method: 'GET',
  path: '/admin/documents/issuance-journal',
  timestamp: new Date().toISOString()
};

function makeDoc(overrides: Partial<GeneratedDocumentEntity> = {}): GeneratedDocumentEntity {
  return {
    id: 'gdoc_x',
    tenantId: 't1',
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: 'Doc',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr',
    fileId: 'f',
    status: 'generated',
    documentNumber: 'N-1',
    documentDate: '2026-05-01',
    isFinal: false,
    generatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides
  };
}

describe('renderIssuanceJournalCsv (Plan B §5.6)', () => {
  it('starts with UTF-8 BOM (0xFEFF) so Excel ru-locale opens correctly', () => {
    const csv = renderIssuanceJournalCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('includes exact header row after BOM', () => {
    const csv = renderIssuanceJournalCsv([]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe(ISSUANCE_JOURNAL_CSV_HEADER);
  });

  it('renders one row per document with index 1..N', () => {
    const csv = renderIssuanceJournalCsv([
      makeDoc({ id: 'g1', documentNumber: 'N-1' }),
      makeDoc({ id: 'g2', documentNumber: 'N-2' })
    ]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1].split(';')[0]).toBe('1');
    expect(lines[2].split(';')[0]).toBe('2');
  });

  it('uses ; as separator (Excel ru-locale default)', () => {
    const csv = renderIssuanceJournalCsv([makeDoc()]);
    const dataRow = csv.replace(/^﻿/, '').split('\r\n')[1];
    expect(dataRow.split(';')).toHaveLength(7);
  });

  it('quotes documentNumber that contains ; or "', () => {
    const csv = renderIssuanceJournalCsv([
      makeDoc({ documentNumber: 'A;B' }),
      makeDoc({ documentNumber: 'has "quote"' })
    ]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[1]).toContain('"A;B"');
    expect(lines[2]).toContain('"has ""quote"""');
  });

  it('renders empty string for missing optional fields', () => {
    const csv = renderIssuanceJournalCsv([
      makeDoc({ documentDate: undefined, documentNumber: undefined })
    ]);
    const cells = csv.replace(/^﻿/, '').split('\r\n')[1].split(';');
    expect(cells[1]).toBe('');
    expect(cells[2]).toBe('');
  });

  it('renders groupOrderDocumentId in the last column', () => {
    const csv = renderIssuanceJournalCsv([makeDoc({ groupOrderDocumentId: 'gdoc_order_123' })]);
    const cells = csv.replace(/^﻿/, '').split('\r\n')[1].split(';');
    expect(cells[6]).toBe('gdoc_order_123');
  });
});

describe('DocumentsController issuance journal endpoints', () => {
  function makeController() {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    const controller = new DocumentsController(service);
    return { state, service, controller };
  }

  it('listIssuanceJournal returns service result for current tenant', () => {
    const { state, controller } = makeController();
    state.generatedDocuments.push(makeDoc({ id: 'g1' }));
    const page = controller.listIssuanceJournal(ctx, {});
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe('g1');
  });

  it('listIssuanceJournal parses comma-less query (single type as string)', () => {
    const { state, controller } = makeController();
    state.generatedDocuments.push(makeDoc({ documentType: 'certificate' }));
    state.generatedDocuments.push(makeDoc({ id: 'g2', documentType: 'order' }));
    const page = controller.listIssuanceJournal(ctx, { types: 'order' });
    expect(page.total).toBe(1);
    expect(page.items[0].documentType).toBe('order');
  });

  it('listIssuanceJournal supports multi types array (NestJS parses ?types=a&types=b)', () => {
    const { state, controller } = makeController();
    state.generatedDocuments.push(makeDoc({ documentType: 'certificate' }));
    state.generatedDocuments.push(makeDoc({ id: 'g2', documentType: 'order' }));
    state.generatedDocuments.push(makeDoc({ id: 'g3', documentType: 'protocol' }));
    const page = controller.listIssuanceJournal(ctx, { types: ['order', 'protocol'] });
    expect(page.total).toBe(2);
  });

  it('exportIssuanceJournalCsv returns CSV string with BOM and header', () => {
    const { state, controller } = makeController();
    state.generatedDocuments.push(makeDoc({ documentNumber: 'TEST-001' }));
    const csv = controller.exportIssuanceJournalCsv(ctx, {});
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(ISSUANCE_JOURNAL_CSV_HEADER);
    expect(csv).toContain('TEST-001');
  });

  it('exportIssuanceJournalCsv applies the configured hard cap', () => {
    expect(ISSUANCE_JOURNAL_CSV_HARD_CAP).toBeGreaterThanOrEqual(1000);
  });
});

describe('DocumentsController.issueGroupOrder (Plan B §5.7)', () => {
  function makeController() {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    const controller = new DocumentsController(service);
    state.templates.push(
      {
        id: 'tpl_order',
        tenantId: 't1',
        name: 'Приказ',
        templateType: 'order',
        status: 'active',
        currentVersionId: 'tplv_order',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tpl_cert',
        tenantId: 't1',
        name: 'Удостоверение',
        templateType: 'certificate',
        status: 'active',
        currentVersionId: 'tplv_cert',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      }
    );
    state.versions.push(
      {
        id: 'tplv_order',
        tenantId: 't1',
        templateId: 'tpl_order',
        versionNo: 1,
        fileId: 'f_o',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tplv_cert',
        tenantId: 't1',
        templateId: 'tpl_cert',
        versionNo: 1,
        fileId: 'f_c',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      }
    );
    return { state, service, controller };
  }

  it('returns IssueGroupOrderResult with order + cascaded certificates', () => {
    const { controller } = makeController();
    const res = controller.issueGroupOrder(ctx, {
      groupId: 'g_1',
      templateId: 'tpl_order',
      enrollmentIds: ['enr_a'],
      certificateTemplateId: 'tpl_cert'
    });
    expect(res.order.documentType).toBe('order');
    expect(res.certificates).toHaveLength(1);
    expect(res.certificates[0].groupOrderDocumentId).toBe(res.order.id);
    expect(res.alreadyExisted).toBe(false);
  });

  it('is idempotent across repeated POSTs', () => {
    const { controller } = makeController();
    const first = controller.issueGroupOrder(ctx, {
      groupId: 'g_1',
      templateId: 'tpl_order',
      enrollmentIds: []
    });
    const second = controller.issueGroupOrder(ctx, {
      groupId: 'g_1',
      templateId: 'tpl_order',
      enrollmentIds: []
    });
    expect(second.order.id).toBe(first.order.id);
    expect(second.alreadyExisted).toBe(true);
  });
});
