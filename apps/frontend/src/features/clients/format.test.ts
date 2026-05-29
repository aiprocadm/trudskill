import { describe, expect, it } from 'vitest';

import {
  CLIENT_STATUS_LABEL,
  buildClientCreatePayload,
  buildClientUpdatePayload,
  emptyClientForm,
  formatInn,
  formatPhone,
  formatProgressLabel,
  toEditFormState
} from './format';

import type { ClientListItem } from './types';

describe('formatInn', () => {
  it('returns dash for undefined', () => {
    expect(formatInn(undefined)).toBe('—');
  });

  it('returns 10 digit ИНН as-is when clean', () => {
    expect(formatInn('7707083893')).toBe('7707083893');
  });

  it('returns 12 digit ИНН (ИП) as-is when clean', () => {
    expect(formatInn('770708389365')).toBe('770708389365');
  });

  it('strips non-digit chars but returns clean 10 digits', () => {
    expect(formatInn('7707-0838-93')).toBe('7707083893');
  });

  it('returns raw input if length is invalid', () => {
    expect(formatInn('123')).toBe('123');
  });
});

describe('formatPhone', () => {
  it('returns dash for undefined', () => {
    expect(formatPhone(undefined)).toBe('—');
  });

  it('formats 11-digit phone starting with 7', () => {
    expect(formatPhone('74951234567')).toBe('+7 (495) 123-45-67');
  });

  it('formats 11-digit phone starting with 8', () => {
    expect(formatPhone('84951234567')).toBe('+7 (495) 123-45-67');
  });

  it('returns input as-is when format is unusual', () => {
    expect(formatPhone('+44-20-1234')).toBe('+44-20-1234');
  });
});

describe('formatProgressLabel', () => {
  it('returns 0 из 0 for empty total', () => {
    expect(formatProgressLabel(0, 0)).toBe('0 из 0');
  });

  it('formats partial progress', () => {
    expect(formatProgressLabel(3, 4)).toBe('3 из 4 (75%)');
  });

  it('formats 100% progress', () => {
    expect(formatProgressLabel(4, 4)).toBe('4 из 4 (100%)');
  });
});

describe('buildClientUpdatePayload', () => {
  it('returns nulls for empty optional strings + required trimmed', () => {
    const payload = buildClientUpdatePayload({
      code: ' X ',
      name: ' Имя ',
      legalName: '',
      inn: '7707083893',
      kpp: '',
      contactEmail: '',
      contactPhone: '',
      legalAddress: '',
      note: '',
      status: 'archived'
    });
    expect(payload.code).toBe('X');
    expect(payload.name).toBe('Имя');
    expect(payload.legalName).toBeNull();
    expect(payload.inn).toBe('7707083893');
    expect(payload.kpp).toBeNull();
    expect(payload.status).toBe('archived');
  });
});

describe('buildClientCreatePayload', () => {
  it('omits empty optional fields entirely', () => {
    const payload = buildClientCreatePayload({
      code: 'C',
      name: 'N',
      legalName: '',
      inn: '',
      kpp: '',
      contactEmail: '',
      contactPhone: '',
      legalAddress: '',
      note: '',
      status: 'active'
    });
    expect(payload).toEqual({ code: 'C', name: 'N' });
  });

  it('includes optional fields when non-empty', () => {
    const payload = buildClientCreatePayload({
      code: 'C',
      name: 'N',
      legalName: 'ООО',
      inn: '7707083893',
      kpp: '770701001',
      contactEmail: 'a@b.ru',
      contactPhone: '+7...',
      legalAddress: 'Москва',
      note: 'note',
      status: 'active'
    });
    expect(payload.inn).toBe('7707083893');
    expect(payload.contactEmail).toBe('a@b.ru');
    expect(payload.note).toBe('note');
  });
});

describe('emptyClientForm + toEditFormState', () => {
  it('emptyClientForm returns blank state with active status', () => {
    const form = emptyClientForm();
    expect(form.code).toBe('');
    expect(form.name).toBe('');
    expect(form.status).toBe('active');
  });

  it('toEditFormState fills from ClientListItem with defaults for missing fields', () => {
    const client: ClientListItem = {
      id: 'cp_1',
      tenantId: 'tenant_demo',
      code: 'CODE',
      name: 'Name',
      inn: '7707083893',
      status: 'archived',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02'
    };
    const form = toEditFormState(client);
    expect(form.code).toBe('CODE');
    expect(form.inn).toBe('7707083893');
    expect(form.kpp).toBe('');
    expect(form.note).toBe('');
    expect(form.status).toBe('archived');
  });
});

describe('CLIENT_STATUS_LABEL', () => {
  it('translates statuses to Russian', () => {
    expect(CLIENT_STATUS_LABEL.active).toBe('Активна');
    expect(CLIENT_STATUS_LABEL.archived).toBe('В архиве');
  });
});
