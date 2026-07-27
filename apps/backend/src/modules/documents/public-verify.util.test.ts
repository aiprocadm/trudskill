import { describe, expect, it } from 'vitest';

import { buildPublicVerifyResult, maskFullName } from './public-verify.util.js';

import type { GeneratedDocumentEntity } from './documents.types.js';

function makeDoc(overrides: Partial<GeneratedDocumentEntity> = {}): GeneratedDocumentEntity {
  return {
    id: 'gdoc_x',
    tenantId: 'secret_tenant',
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: 'Doc',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr',
    fileId: 'f',
    status: 'generated',
    documentNumber: 'N-1',
    documentDate: '2026-05-26',
    isFinal: false,
    generatedAt: '2026-05-26T00:00:00.000Z',
    qrToken: 'tok',
    ...overrides
  };
}

describe('buildPublicVerifyResult', () => {
  it('maps a generated document to a valid public result', () => {
    const r = buildPublicVerifyResult(makeDoc());
    expect(r.status).toBe('valid');
    expect(r.documentId).toBe('gdoc_x');
    expect(r.documentNumber).toBe('N-1');
    expect(r.documentType).toBe('certificate');
    expect(r.issueDate).toBe('2026-05-26');
  });

  it('maps a revoked document and exposes the revocation reason but no actor', () => {
    const r = buildPublicVerifyResult(
      makeDoc({
        status: 'revoked' as never,
        revokedAt: '2026-06-01T00:00:00.000Z',
        revocationReason: 'причина',
        revokedBy: 'secret_admin'
      } as never)
    );
    expect(r.status).toBe('revoked');
    expect(r.revocationReason).toBe('причина');
    expect(JSON.stringify(r)).not.toContain('secret_admin');
  });

  it('treats an archived (withdrawn) document as not_found and leaks no document fields', () => {
    const r = buildPublicVerifyResult(
      makeDoc({ status: 'archived', archivedAt: '2026-06-10T00:00:00.000Z' } as never)
    );
    expect(r.status).toBe('not_found');
    expect(r.documentId).toBeUndefined();
    expect(r.documentNumber).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('gdoc_x');
    expect(JSON.stringify(r)).not.toContain('N-1');
  });

  it('never leaks tenantId or PII fields', () => {
    const r = buildPublicVerifyResult(makeDoc());
    expect(JSON.stringify(r)).not.toContain('secret_tenant');
    for (const key of ['tenantId', 'learnerFullName', 'snils', 'issuerName']) {
      expect(Object.keys(r)).not.toContain(key);
    }
  });

  it('exposes signatureStatus only when signed', () => {
    expect(buildPublicVerifyResult(makeDoc()).signatureStatus).toBeUndefined();
    const signed = buildPublicVerifyResult(
      makeDoc({ signatureStatus: 'signed', signatureCertificateSubject: 'CN=УЦ' } as never)
    );
    expect(signed.signatureStatus).toBe('signed');
    expect(signed.signatureCertificateSubject).toBe('CN=УЦ');
  });
});

describe('maskFullName (ФТ-A6.1 — «без лишних ПДн»)', () => {
  it('сокращает имя и отчество до инициалов', () => {
    expect(maskFullName('Иванов Иван Иванович')).toBe('Иванов И. И.');
  });

  it('работает без отчества', () => {
    expect(maskFullName('Иванов Иван')).toBe('Иванов И.');
  });

  it('оставляет одну фамилию как есть — сокращать нечего', () => {
    expect(maskFullName('Иванов')).toBe('Иванов');
  });

  it('сохраняет двойную фамилию целиком', () => {
    expect(maskFullName('Петров-Водкин Кузьма Сергеевич')).toBe('Петров-Водкин К. С.');
  });

  it('переживает лишние пробелы', () => {
    expect(maskFullName('  Иванов   Иван  Иванович ')).toBe('Иванов И. И.');
  });

  it('отбрасывает хвост длиннее трёх частей — в инициалы идут только имя и отчество', () => {
    expect(maskFullName('Иванов Иван Иванович Младший')).toBe('Иванов И. И.');
  });

  it('на пустом значении возвращает undefined, а не пустую строку', () => {
    expect(maskFullName('   ')).toBeUndefined();
    expect(maskFullName(undefined)).toBeUndefined();
  });
});

describe('buildPublicVerifyResult — частичное ФИО (ФТ-A6.1)', () => {
  it('отдаёт инициалы, если документ их сохранил при выпуске', () => {
    const result = buildPublicVerifyResult(makeDoc({ learnerNamePublic: 'Иванов И. И.' }));
    expect(result.learnerFullName).toBe('Иванов И. И.');
  });

  it('не выдумывает ФИО для документов, выпущенных до этой фичи', () => {
    expect(buildPublicVerifyResult(makeDoc()).learnerFullName).toBeUndefined();
  });

  it('у отозванного документа ФИО тоже частичное', () => {
    const result = buildPublicVerifyResult(
      makeDoc({ status: 'revoked', learnerNamePublic: 'Петров П.' })
    );
    expect(result.status).toBe('revoked');
    expect(result.learnerFullName).toBe('Петров П.');
  });

  it('архивный документ не раскрывает даже инициалы', () => {
    const result = buildPublicVerifyResult(
      makeDoc({ status: 'archived', learnerNamePublic: 'Иванов И. И.' })
    );
    expect(result.status).toBe('not_found');
    expect(result.learnerFullName).toBeUndefined();
  });
});
