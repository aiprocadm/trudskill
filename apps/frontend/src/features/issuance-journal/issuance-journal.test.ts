import { describe, expect, it } from 'vitest';

import { ALL_TEMPLATE_TYPES, TEMPLATE_TYPE_LABELS, type TemplateType } from './types';

describe('Issuance journal types (Plan B §5.6)', () => {
  it('ALL_TEMPLATE_TYPES enumerates 8 template types', () => {
    expect(ALL_TEMPLATE_TYPES).toEqual([
      'certificate',
      'protocol',
      'order',
      'diploma',
      'attestation',
      'reference',
      'report',
      'contract'
    ]);
  });

  it('TEMPLATE_TYPE_LABELS covers every TemplateType with a non-empty Russian label', () => {
    for (const t of ALL_TEMPLATE_TYPES) {
      const label = TEMPLATE_TYPE_LABELS[t];
      expect(label).toBeTruthy();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('TEMPLATE_TYPE_LABELS keys match the TemplateType union (compile-time + runtime check)', () => {
    const labelKeys = Object.keys(TEMPLATE_TYPE_LABELS).sort() as TemplateType[];
    const expected = [...ALL_TEMPLATE_TYPES].sort();
    expect(labelKeys).toEqual(expected);
  });
});
