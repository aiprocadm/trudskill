import { describe, expect, it } from 'vitest';

import {
  ALL_LICENSE_STATUSES,
  ALL_LICENSE_TYPES,
  LICENSE_STATUS_LABELS,
  LICENSE_TYPE_LABELS,
  type LicenseStatus,
  type LicenseType
} from './types';

describe('Licenses types (Plan C §5.10)', () => {
  it('ALL_LICENSE_TYPES enumerates 4 known types', () => {
    expect(ALL_LICENSE_TYPES).toEqual([
      'education_license',
      'accreditation',
      'sro_membership',
      'other'
    ]);
  });

  it('ALL_LICENSE_STATUSES enumerates 3 known statuses', () => {
    expect(ALL_LICENSE_STATUSES).toEqual(['active', 'expired', 'revoked']);
  });

  it('LICENSE_TYPE_LABELS keys match the LicenseType union', () => {
    const keys = Object.keys(LICENSE_TYPE_LABELS).sort() as LicenseType[];
    const expected = [...ALL_LICENSE_TYPES].sort();
    expect(keys).toEqual(expected);
    for (const t of ALL_LICENSE_TYPES) {
      expect(LICENSE_TYPE_LABELS[t].length).toBeGreaterThan(0);
    }
  });

  it('LICENSE_STATUS_LABELS keys match the LicenseStatus union', () => {
    const keys = Object.keys(LICENSE_STATUS_LABELS).sort() as LicenseStatus[];
    const expected = [...ALL_LICENSE_STATUSES].sort();
    expect(keys).toEqual(expected);
    for (const s of ALL_LICENSE_STATUSES) {
      expect(LICENSE_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });
});
