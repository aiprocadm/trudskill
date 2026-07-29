import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS,
  MAX_IDENTITY_IMAGE_RETENTION_DAYS,
  MIN_IDENTITY_IMAGE_RETENTION_DAYS,
  TENANT_IDENTITY_SETTINGS_KEY,
  identityImageRetentionDays,
  isValidRetentionDays,
  readTenantIdentitySettings
} from './tenant-identity-settings.js';

import type { TenantRequisites } from './tenant.types.js';

const requisites = (payload: Record<string, unknown>): TenantRequisites => ({
  tenantId: 'tenant_demo',
  legalName: 'ООО Демо',
  taxNumber: '7700000000',
  payload
});

describe('настройки идентификации тенанта (ФТ-C3.1)', () => {
  it('без настройки работает прежний срок — обновление не меняет поведение молча', () => {
    expect(identityImageRetentionDays(undefined)).toBe(DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS);
    expect(identityImageRetentionDays(requisites({}))).toBe(90);
  });

  it('центр может поставить свой срок', () => {
    const r = requisites({ [TENANT_IDENTITY_SETTINGS_KEY]: { imageRetentionDays: 30 } });
    expect(identityImageRetentionDays(r)).toBe(30);
  });

  it('границы допустимого включительно', () => {
    expect(isValidRetentionDays(MIN_IDENTITY_IMAGE_RETENTION_DAYS)).toBe(true);
    expect(isValidRetentionDays(MAX_IDENTITY_IMAGE_RETENTION_DAYS)).toBe(true);
  });

  it('ноль дней запрещён — оспорить решение модератора стало бы нечем', () => {
    expect(isValidRetentionDays(0)).toBe(false);
  });

  it('бессрочное хранение запрещено — это противоречит минимизации данных', () => {
    expect(isValidRetentionDays(MAX_IDENTITY_IMAGE_RETENTION_DAYS + 1)).toBe(false);
  });

  describe('мусор в payload откатывается к умолчанию, а не роняет очистку', () => {
    // Уронить крон значило бы перестать удалять ПДн у ВСЕХ тенантов из-за опечатки у одного.
    for (const bad of [
      { imageRetentionDays: '30' },
      { imageRetentionDays: 0 },
      { imageRetentionDays: -5 },
      { imageRetentionDays: 12.5 },
      { imageRetentionDays: null },
      { imageRetentionDays: 100000 },
      { imageRetentionDays: Number.NaN }
    ]) {
      it(`${JSON.stringify(bad)}`, () => {
        const r = requisites({ [TENANT_IDENTITY_SETTINGS_KEY]: bad });
        expect(readTenantIdentitySettings(r).imageRetentionDays).toBeUndefined();
        expect(identityImageRetentionDays(r)).toBe(DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS);
      });
    }

    it('не объект вместо настроек', () => {
      expect(identityImageRetentionDays(requisites({ [TENANT_IDENTITY_SETTINGS_KEY]: 'x' }))).toBe(
        DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS
      );
    });
  });
});
