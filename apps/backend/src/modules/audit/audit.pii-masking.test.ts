import { describe, expect, it } from 'vitest';

import { AuditService } from './audit.service.js';

describe('AuditService PII masking', () => {
  it('masks snils field in newValues', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'learner.updated',
      entityType: 'mvp.learner',
      entityId: 'l1',
      newValues: { snils: '111-111-111 11', position: 'engineer' }
    });
    const recorded = audit['records'][0];
    expect(recorded.newValues?.snils).toBe('***');
    expect(recorded.newValues?.position).toBe('engineer'); // не ПДн
  });

  it('masks email in oldValues', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'learner.updated',
      entityType: 'mvp.learner',
      entityId: 'l1',
      oldValues: { email: 'secret@example.com' },
      newValues: { email: 'new@example.com' }
    });
    const recorded = audit['records'][0];
    expect(recorded.oldValues?.email).toBe('***');
    expect(recorded.newValues?.email).toBe('***');
  });

  it('masks firstName/lastName/middleName/passport/phone/birthDate', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'learner.created',
      entityType: 'mvp.learner',
      entityId: 'l1',
      newValues: {
        firstName: 'Анна',
        lastName: 'Сидорова',
        middleName: 'Ивановна',
        passportSeriesNumber: '4500 123456',
        phoneNumber: '+79991234567',
        birthDate: '1990-01-15',
        normalField: 'visible'
      }
    });
    const recorded = audit['records'][0];
    expect(recorded.newValues?.firstName).toBe('***');
    expect(recorded.newValues?.lastName).toBe('***');
    expect(recorded.newValues?.middleName).toBe('***');
    expect(recorded.newValues?.passportSeriesNumber).toBe('***');
    expect(recorded.newValues?.phoneNumber).toBe('***');
    expect(recorded.newValues?.birthDate).toBe('***');
    expect(recorded.newValues?.normalField).toBe('visible');
  });

  it('does NOT mask non-PII fields (status, id, etc)', () => {
    const audit = new AuditService();
    audit.write({
      tenantId: 't1',
      action: 'documents.updated',
      entityType: 'documents.generated',
      entityId: 'g1',
      newValues: { status: 'revoked', revocationReason: 'mistake' }
    });
    const recorded = audit['records'][0];
    expect(recorded.newValues?.status).toBe('revoked');
    expect(recorded.newValues?.revocationReason).toBe('mistake');
  });
});
