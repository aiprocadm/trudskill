import { describe, expect, it } from 'vitest';

import {
  SCORM_ZIP_LIMITS,
  assertSafeEntryPath,
  contentTypeForPath,
  createZipBudget
} from './scorm-zip-guards.js';

describe('assertSafeEntryPath', () => {
  it('пропускает обычные относительные пути', () => {
    expect(() => assertSafeEntryPath('content/js/app.js')).not.toThrow();
  });
  for (const bad of ['../evil.js', 'a/../../evil.js', '/etc/passwd', 'C:\\windows\\x', 'a\\b.js']) {
    it(`отклоняет ${bad} → scorm_zip_unsafe_path`, () => {
      expect(() => assertSafeEntryPath(bad)).toThrowError(
        expect.objectContaining({ code: 'scorm_zip_unsafe_path' })
      );
    });
  }
});

describe('createZipBudget', () => {
  it('считает entries и байты, бросает при превышении entry-лимита', () => {
    const budget = createZipBudget();
    for (let i = 0; i < SCORM_ZIP_LIMITS.maxEntries; i++) budget.addEntry(10);
    expect(() => budget.addEntry(10)).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_too_many_entries' })
    );
  });
  it('бросает при превышении total-байт', () => {
    const budget = createZipBudget();
    expect(() => budget.addEntry(SCORM_ZIP_LIMITS.maxTotalBytes + 1)).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_too_large' })
    );
  });
  it('бросает при слишком большом одиночном entry', () => {
    const budget = createZipBudget();
    expect(() => budget.addEntry(SCORM_ZIP_LIMITS.maxEntryBytes + 1)).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_entry_too_large' })
    );
  });
});

describe('contentTypeForPath', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['js/app.js', 'text/javascript'],
    ['style.css', 'text/css'],
    ['img/logo.png', 'image/png'],
    ['data.json', 'application/json'],
    ['video.mp4', 'video/mp4'],
    ['unknown.bin', 'application/octet-stream']
  ])('%s → %s', (p, expected) => {
    expect(contentTypeForPath(p)).toBe(expected);
  });
});
