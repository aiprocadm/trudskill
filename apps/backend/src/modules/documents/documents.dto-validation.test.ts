import { describe, expect, it } from 'vitest';

import {
  ALLOWED_TEMPLATE_TYPES,
  ALLOWED_VARIABLE_CATEGORY_CODES,
  assertTemplateType,
  assertVariableCategoryCode
} from './documents.dto.js';

import type { TemplateType, VariableCategoryCode } from './documents.types.js';

describe('documents DTO — Pillar A Plan B allow-lists', () => {
  it('ALLOWED_TEMPLATE_TYPES contains 8 known values (7 regulated + contract grandfathered)', () => {
    expect(ALLOWED_TEMPLATE_TYPES).toEqual([
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

  it('assertTemplateType accepts every allowed value', () => {
    for (const t of ALLOWED_TEMPLATE_TYPES) {
      expect(() => assertTemplateType(t)).not.toThrow();
    }
  });

  it('assertTemplateType rejects unknown value with a descriptive error', () => {
    expect(() => assertTemplateType('something_else')).toThrow(/template_type/);
  });

  it('assertTemplateType rejects non-string', () => {
    expect(() => assertTemplateType(42)).toThrow(/template_type/);
    expect(() => assertTemplateType(undefined)).toThrow(/template_type/);
  });

  it('ALLOWED_VARIABLE_CATEGORY_CODES contains 10 known values', () => {
    expect(ALLOWED_VARIABLE_CATEGORY_CODES).toEqual([
      'tenant',
      'group',
      'learner',
      'counterparty',
      'course',
      'commission',
      'document',
      'program',
      'enrollment',
      'group_learners'
    ]);
  });

  it('assertVariableCategoryCode accepts every allowed value', () => {
    for (const c of ALLOWED_VARIABLE_CATEGORY_CODES) {
      expect(() => assertVariableCategoryCode(c)).not.toThrow();
    }
  });

  it('assertVariableCategoryCode rejects unknown value', () => {
    expect(() => assertVariableCategoryCode('mystery')).toThrow(/category_code/);
  });

  it('compile-time sync: ALLOWED_TEMPLATE_TYPES is `readonly TemplateType[]`', () => {
    const check: readonly TemplateType[] = ALLOWED_TEMPLATE_TYPES;
    expect(check).toBe(ALLOWED_TEMPLATE_TYPES);
  });

  it('compile-time sync: ALLOWED_VARIABLE_CATEGORY_CODES is `readonly VariableCategoryCode[]`', () => {
    const check: readonly VariableCategoryCode[] = ALLOWED_VARIABLE_CATEGORY_CODES;
    expect(check).toBe(ALLOWED_VARIABLE_CATEGORY_CODES);
  });
});
