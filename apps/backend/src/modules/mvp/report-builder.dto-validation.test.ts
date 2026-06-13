import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { BuildReportRequestDto, SaveReportTemplateDto } from './report-builder.dto.js';

function errs(cls: new () => object, raw: unknown): string[] {
  const instance = plainToInstance(cls, raw);
  return validateSync(instance as object, { whitelist: false }).map((e) => e.property);
}

describe('BuildReportRequestDto', () => {
  it('accepts a valid request with filters', () => {
    expect(
      errs(BuildReportRequestDto, {
        entityKey: 'enrollments',
        selectedFields: ['status', 'learnerName'],
        filters: [{ key: 'status', value: 'active' }]
      })
    ).toEqual([]);
  });

  it('accepts a request without filters (optional)', () => {
    expect(
      errs(BuildReportRequestDto, { entityKey: 'learners', selectedFields: ['fullName'] })
    ).toEqual([]);
  });

  it('rejects an unknown entityKey', () => {
    expect(
      errs(BuildReportRequestDto, { entityKey: 'documents', selectedFields: ['x'] })
    ).toContain('entityKey');
  });

  it('rejects empty selectedFields', () => {
    expect(errs(BuildReportRequestDto, { entityKey: 'learners', selectedFields: [] })).toContain(
      'selectedFields'
    );
  });

  it('rejects a malformed filter entry', () => {
    expect(
      errs(BuildReportRequestDto, {
        entityKey: 'learners',
        selectedFields: ['fullName'],
        filters: [{ key: 'status' }]
      })
    ).toContain('filters');
  });
});

describe('SaveReportTemplateDto', () => {
  it('accepts a valid template save', () => {
    expect(
      errs(SaveReportTemplateDto, {
        name: 'Активные по группе',
        entityKey: 'enrollments',
        selectedFields: ['learnerName', 'status']
      })
    ).toEqual([]);
  });

  it('requires a non-empty name', () => {
    expect(
      errs(SaveReportTemplateDto, { name: '', entityKey: 'learners', selectedFields: ['fullName'] })
    ).toContain('name');
  });
});
