import { describe, expect, it } from 'vitest';

import { collectDocumentImageRefs } from './document-images.js';

import type { TenantRequisites } from '../tenant/tenant.types.js';

/** Отбор картинок бланка (ФТ-A7.1, Фаза 1 Task 9). */

const requisites = (payload: Record<string, unknown>): TenantRequisites => ({
  tenantId: 't',
  legalName: 'ООО УЦ',
  taxNumber: '7701',
  payload
});

describe('collectDocumentImageRefs', () => {
  it('берёт только переменные-картинки с заполненным fileId', () => {
    const refs = collectDocumentImageRefs({
      'tenant.name': 'УЦ',
      'tenant.signature_image': 'file-sign',
      'tenant.stamp_image': '',
      'commission.chairman.signature_file_id': 'file-chair'
    });
    expect(refs.map((r) => r.name).sort()).toEqual([
      'commission.chairman.signature_file_id',
      'tenant.signature_image'
    ]);
  });

  it('подставляет ширину по умолчанию — иначе скан подписи занял бы пол-листа', () => {
    const [signature] = collectDocumentImageRefs({ 'tenant.signature_image': 'file-sign' });
    expect(signature!.widthMm).toBe(40);
  });

  it('ширина из настроек тенанта важнее умолчания', () => {
    const [signature] = collectDocumentImageRefs(
      { 'tenant.signature_image': 'file-sign' },
      requisites({ documentImages: { signature: { fileId: 'file-sign', widthMm: 25 } } })
    );
    expect(signature!.widthMm).toBe(25);
  });

  it('мусор в payload реквизитов не ломает выдачу', () => {
    const refs = collectDocumentImageRefs(
      { 'tenant.stamp_image': 'file-stamp' },
      requisites({ documentImages: { stamp: { fileId: 'file-stamp', widthMm: -5 }, ghost: 42 } })
    );
    expect(refs).toEqual([{ name: 'tenant.stamp_image', fileId: 'file-stamp', widthMm: 35 }]);
  });
});
