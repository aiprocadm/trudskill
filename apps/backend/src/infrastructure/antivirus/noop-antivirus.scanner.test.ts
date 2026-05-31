import { describe, expect, it } from 'vitest';

import { NoopAntivirusScanner } from './antivirus.scanner.js';

describe('NoopAntivirusScanner', () => {
  it('always reports clean without touching storage', async () => {
    const scanner = new NoopAntivirusScanner();
    const result = await scanner.scan({ key: 'submissions/t1/whatever.pdf' });
    expect(result).toEqual({ verdict: 'clean' });
  });
});
