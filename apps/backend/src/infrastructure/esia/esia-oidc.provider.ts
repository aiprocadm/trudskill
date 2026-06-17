import { type EsiaIdentityProvider, type EsiaResolvedIdentity } from './esia-identity.provider.js';

export interface EsiaOidcConfig {
  clientId: string;
  authorizeUrl: string;
  scopes: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  certPath?: string;
}

/**
 * Real ЕСИА OIDC adapter — ACTIVATION FOLLOW-UP, not functional yet.
 * To go live: (1) obtain ИС status + mnemonic + registered redirect_uri; (2) install the org's
 * ГОСТ certificate (УЦ ФНС); (3) implement detached ГОСТ signing of the request below via КриптоПро;
 * (4) set ESIA_ENABLED=true, ESIA_PROVIDER=esia, ESIA_* urls. See spec §10.
 */
export class EsiaOidcProvider implements EsiaIdentityProvider {
  readonly id = 'esia';
  constructor(private readonly cfg: EsiaOidcConfig) {}

  buildAuthorizeUrl(params: {
    state: string;
    purpose: 'login' | 'identity';
    redirectUri: string;
  }): string {
    const timestamp = '<<gost-signed-timestamp>>'; // TODO: ГОСТ-подпись (follow-up) — see class doc
    const q = new URLSearchParams({
      client_id: this.cfg.clientId,
      response_type: 'code',
      scope: this.cfg.scopes,
      state: params.state,
      redirect_uri: params.redirectUri,
      access_type: 'online',
      timestamp
    });
    return `${this.cfg.authorizeUrl}?${q.toString()}`;
  }

  async exchangeCode(): Promise<EsiaResolvedIdentity> {
    // TODO: ГОСТ-подпись запроса + POST token + GET userinfo (КриптоПро). Follow-up.
    throw new Error('EsiaOidcProvider.exchangeCode not implemented — ГОСТ signing is a follow-up');
  }
}
