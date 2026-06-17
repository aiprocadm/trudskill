import { type EsiaIdentityProvider, type EsiaResolvedIdentity } from './esia-identity.provider.js';

/** Encode a fake identity into an opaque `code` so the local loop can recover it. */
export const encodeMockCode = (identity: EsiaResolvedIdentity): string =>
  Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url');

const decodeMockCode = (code: string): EsiaResolvedIdentity =>
  JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as EsiaResolvedIdentity;

/**
 * Dev/test provider. A real Госуслуги round-trip is replaced by a local loop: the authorize URL
 * is the backend callback itself, carrying a `code` that encodes a canned identity. Configure the
 * default identity via the constructor; the orchestration may also mint its own code with
 * encodeMockCode for deterministic tests.
 */
export class MockEsiaProvider implements EsiaIdentityProvider {
  readonly id = 'mock';
  constructor(
    private readonly defaultIdentity: EsiaResolvedIdentity = {
      snils: '11223344595',
      lastName: 'Тестов',
      firstName: 'Тест',
      middleName: 'Тестович',
      birthDate: '1990-01-01',
      email: 'esia-mock@example.test'
    }
  ) {}

  buildAuthorizeUrl(params: {
    state: string;
    purpose: 'login' | 'identity';
    redirectUri: string;
  }): string {
    const code = encodeMockCode(this.defaultIdentity);
    const sep = params.redirectUri.includes('?') ? '&' : '?';
    return `${params.redirectUri}${sep}code=${code}&state=${encodeURIComponent(params.state)}`;
  }

  async exchangeCode(params: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<EsiaResolvedIdentity> {
    return decodeMockCode(params.code);
  }
}
