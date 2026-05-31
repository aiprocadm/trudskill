/** Result of an antivirus scan. `pending` is never a verdict — only a stored, not-yet-scanned state. */
export type AntivirusVerdict = 'clean' | 'infected' | 'error';

export interface ScanResult {
  verdict: AntivirusVerdict;
  /** Signature name when infected; error text when error. Omitted when clean. */
  detail?: string;
}

export interface AntivirusScanner {
  scan(params: { key: string }): Promise<ScanResult>;
}

/** DI token for the active scanner. Mirrors MVP_PERSISTENCE_BACKEND. */
export const ANTIVIRUS_SCANNER = Symbol('ANTIVIRUS_SCANNER');

/**
 * Default scanner for dev/test and any environment where ANTIVIRUS_ENABLED=false.
 * Marks everything clean so the existing upload→attach→download flow is unchanged.
 * Real protection is opt-in via the ClamAV scanner behind the flag.
 */
export class NoopAntivirusScanner implements AntivirusScanner {
  async scan(_params: { key: string }): Promise<ScanResult> {
    return { verdict: 'clean' };
  }
}
