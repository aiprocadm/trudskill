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

  // I-1: percent-encoded traversal
  it('отклоняет %2e%2e/evil.js (encoded traversal) → scorm_zip_unsafe_path', () => {
    expect(() => assertSafeEntryPath('%2e%2e/evil.js')).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_unsafe_path' })
    );
  });
  it('отклоняет a%2Fb.js (encoded slash) → scorm_zip_unsafe_path', () => {
    expect(() => assertSafeEntryPath('a%2Fb.js')).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_unsafe_path' })
    );
  });

  // I-2: NUL byte
  it('отклоняет путь с NUL-байтом → scorm_zip_unsafe_path', () => {
    expect(() => assertSafeEntryPath('a\x00b.js')).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_unsafe_path' })
    );
  });
});

describe('createZipBudget', () => {
  it('считает entries и байты, бросает при превышении entry-лимита', () => {
    const budget = createZipBudget();
    for (let i = 0; i < SCORM_ZIP_LIMITS.maxEntries; i++) budget.addEntry(10);
    expect(() => budget.addEntry(10)).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_too_many_entries' })
    );
  });
  it('бросает при превышении total-байт (несколько entry по 200 MB)', () => {
    const budget = createZipBudget();
    // 200 MB < maxEntryBytes (300 MB), поэтому entry_too_large не будет раньше total-лимита.
    // 1.5 GB / 200 MB = 7.5, т.е. после 8 вызовов total = 1.6 GB > 1.5 GB.
    const entrySize = 200 * 1024 * 1024;
    const count = Math.ceil(SCORM_ZIP_LIMITS.maxTotalBytes / entrySize);
    let threw = false;
    for (let i = 0; i <= count; i++) {
      try {
        budget.addEntry(entrySize);
      } catch (e) {
        expect(e).toEqual(expect.objectContaining({ code: 'scorm_zip_too_large' }));
        threw = true;
        break;
      }
    }
    expect(threw).toBe(true);
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
