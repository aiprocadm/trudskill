import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateWebinarRequest, ProviderSettingsRequest } from './webinars.dto.js';

const errs = (cls: any, raw: unknown) => validateSync(plainToInstance(cls, raw));

describe('webinars DTOs', () => {
  it('accepts a valid CreateWebinarRequest', () => {
    expect(
      errs(CreateWebinarRequest, {
        title: 'Intro to OT',
        plannedStartAt: '2026-07-01T10:00:00.000Z',
        plannedEndAt: '2026-07-01T11:00:00.000Z'
      })
    ).toHaveLength(0);
  });

  it('rejects a CreateWebinarRequest with an empty title', () => {
    expect(
      errs(CreateWebinarRequest, { title: '', plannedStartAt: 'x', plannedEndAt: 'y' }).length
    ).toBeGreaterThan(0);
  });

  it('accepts a valid ProviderSettingsRequest', () => {
    expect(
      errs(ProviderSettingsRequest, {
        providerCode: 'jitsi',
        baseUrl: 'https://meet.example.org',
        enabled: true
      })
    ).toHaveLength(0);
  });

  it('rejects an unknown provider code', () => {
    expect(
      errs(ProviderSettingsRequest, { providerCode: 'skype', enabled: true }).length
    ).toBeGreaterThan(0);
  });
});
