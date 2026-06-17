import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Provider-agnostic ЕСИА (Госуслуги) OAuth/OIDC seam, mirroring DocumentSignatureProvider
 * and AntivirusScanner. Noop is the safe default whenever ESIA_ENABLED=false: every entry
 * point refuses, so no login/identity path can run without an explicitly configured provider.
 */
export interface EsiaResolvedIdentity {
  /** Normalised СНИЛС — digits only (11 chars). */
  snils: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  /** ISO YYYY-MM-DD. */
  birthDate?: string;
  email?: string;
}

export type EsiaPurpose = 'login' | 'identity';

export interface EsiaIdentityProvider {
  /** Stable id stored in audit for traceability ('noop' | 'mock' | 'esia'). */
  readonly id: string;
  /** Build the Госуслуги authorize URL. `state` is the caller's signed token. */
  buildAuthorizeUrl(params: { state: string; purpose: EsiaPurpose; redirectUri: string }): string;
  /** Exchange the callback `code` for the citizen's identity (token + userinfo + ГОСТ sign). */
  exchangeCode(params: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<EsiaResolvedIdentity>;
}

/** DI token for the active provider. Mirrors ANTIVIRUS_SCANNER / DOCUMENT_SIGNATURE_PROVIDER. */
export const ESIA_IDENTITY_PROVIDER = Symbol('ESIA_IDENTITY_PROVIDER');

const disabled = (): never => {
  throw new ServiceUnavailableException({
    code: 'esia_disabled',
    message: 'Вход через Госуслуги недоступен'
  });
};

export class NoopEsiaProvider implements EsiaIdentityProvider {
  readonly id = 'noop';
  buildAuthorizeUrl(): string {
    return disabled();
  }
  async exchangeCode(): Promise<EsiaResolvedIdentity> {
    return disabled();
  }
}
