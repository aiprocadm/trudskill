import { describe, expect, it } from 'vitest';

import { companyLabel, consentLabel, currentGroupLabel, lastLoginLabel } from './registry-labels';

/** Подписи сведений реестра слушателей (МГ-C3.2, срез 11.2). */
describe('подписи реестра', () => {
  it('без сведений (снимок без базы) — прочерк, а не выдумка', () => {
    expect(companyLabel(undefined)).toBe('—');
    expect(currentGroupLabel(undefined)).toBe('—');
    expect(lastLoginLabel(undefined)).toBe('—');
    expect(consentLabel(undefined)).toBe('—');
  });

  it('со сведениями — по-русски: компания, группа со статусом, вход, согласие', () => {
    const details = {
      companyName: 'ООО «Ромб»',
      currentGroupName: 'ОТ-14',
      currentGroupStatus: 'in_progress',
      lastLoginAt: '2026-09-20T10:00:00.000Z',
      consentGranted: true
    };
    expect(companyLabel(details)).toBe('ООО «Ромб»');
    expect(currentGroupLabel(details)).toContain('ОТ-14 · ');
    expect(currentGroupLabel(details)).not.toContain('in_progress');
    expect(lastLoginLabel(details)).toContain('2026');
    expect(consentLabel(details)).toBe('действует');
    expect(companyLabel({ consentGranted: false })).toBe('без компании');
    expect(currentGroupLabel({ consentGranted: false })).toBe('без группы');
    expect(lastLoginLabel({ consentGranted: false })).toBe('не входил');
    expect(consentLabel({ consentGranted: false })).toBe('нет');
  });
});
