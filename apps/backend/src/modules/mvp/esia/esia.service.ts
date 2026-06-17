// apps/backend/src/modules/mvp/esia/esia.service.ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException
} from '@nestjs/common';

import {
  ESIA_IDENTITY_PROVIDER,
  type EsiaIdentityProvider,
  type EsiaPurpose
} from '../../../infrastructure/esia/esia-identity.provider.js';
import {
  type EsiaStateClaims,
  signEsiaState,
  verifyEsiaState
} from '../../../infrastructure/esia/esia-state.js';
import { IamService } from '../../iam/services/iam.service.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

export interface EsiaServiceConfig {
  secret: string;
  ttlSeconds: number;
  callbackUrl: string;
  /** Injected clock so unit tests are deterministic. */
  nowMs: () => number;
}

export const ESIA_SERVICE_CONFIG = Symbol('ESIA_SERVICE_CONFIG');

@Injectable({ scope: Scope.REQUEST })
export class EsiaService {
  constructor(
    @Inject(ESIA_IDENTITY_PROVIDER) private readonly provider: EsiaIdentityProvider,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(ESIA_SERVICE_CONFIG) private readonly config: EsiaServiceConfig
  ) {}

  /** Sign a state token and return the Госуслуги authorize URL. */
  startAuthorize(
    purpose: EsiaPurpose,
    tenantId: string,
    learnerId?: string
  ): { authorizeUrl: string } {
    const now = this.config.nowMs();
    const nonce = `${tenantId}:${now}`;
    const state = signEsiaState(
      { purpose, tenantId, nonce, ...(learnerId ? { learnerId } : {}) },
      this.config.secret,
      this.config.ttlSeconds,
      now
    );
    const authorizeUrl = this.provider.buildAuthorizeUrl({
      state,
      purpose,
      redirectUri: this.config.callbackUrl
    });
    return { authorizeUrl };
  }

  /**
   * Decode the purpose from a state token WITHOUT verifying its signature — used only to branch
   * the callback. Signature + expiry are still checked in resolveLoginUser/approveIdentity.
   */
  peekPurpose(state: string): EsiaPurpose {
    try {
      const body = state.split('.')[0] ?? '';
      const json = Buffer.from(body, 'base64url').toString('utf8');
      return (JSON.parse(json) as { purpose?: EsiaPurpose }).purpose === 'identity'
        ? 'identity'
        : 'login';
    } catch {
      return 'login';
    }
  }

  /**
   * Verify the signed state (signature + expiry) and assert the purpose. tenantId — and, for
   * identity, learnerId — are READ FROM the returned claims, so the callback needs nothing from
   * the (cookie-only) guard context.
   */
  private verifyAndGetClaims(state: string, expected: EsiaPurpose): EsiaStateClaims {
    const claims = verifyEsiaState(state, this.config.secret, this.config.nowMs());
    if (claims.purpose !== expected) {
      throw new ForbiddenException({
        code: 'esia_state_mismatch',
        message: 'Недействительный запрос'
      });
    }
    return claims;
  }

  /** Login: state → exchange → learner-by-СНИЛС → resolve/link IAM user. Never auto-creates a learner. */
  async resolveLoginUser(
    code: string,
    state: string
  ): Promise<{ userId: string; databaseBacked: boolean; tenantId: string }> {
    const claims = this.verifyAndGetClaims(state, 'login');
    const { tenantId } = claims;
    const identity = await this.provider.exchangeCode({
      code,
      state,
      redirectUri: this.config.callbackUrl
    });
    const learners = this.mvp.findLearnersBySnils(tenantId, identity.snils);
    if (learners.length === 0) {
      throw new ForbiddenException({
        code: 'esia_learner_not_enrolled',
        message: 'Вас ещё не зачислили в этот учебный центр'
      });
    }
    const learner = learners[0]!;
    if (!learner.email) {
      throw new ForbiddenException({
        code: 'esia_learner_no_account',
        message: 'У вашего профиля нет адреса для входа — обратитесь в учебный центр'
      });
    }
    // Learner already verified to exist → creating/linking the IAM user is legitimate (not auto-signup).
    const { user, databaseBacked } = await this.iam.findOrCreateByEmail(tenantId, learner.email);
    this.mvp.linkLearnerToIamUser(tenantId, learner.id, user.id);
    return { userId: user.id, databaseBacked, tenantId };
  }

  /** Identity: state → exchange → compare СНИЛС with the state's learner → auto-approve. */
  async approveIdentity(
    code: string,
    state: string,
    context: RequestContext
  ): Promise<{ verificationId: string; tenantId: string }> {
    const claims = this.verifyAndGetClaims(state, 'identity');
    const { tenantId, learnerId } = claims;
    if (!learnerId) {
      throw new ForbiddenException({
        code: 'esia_state_mismatch',
        message: 'Недействительный запрос'
      });
    }
    const identity = await this.provider.exchangeCode({
      code,
      state,
      redirectUri: this.config.callbackUrl
    });
    const matches = this.mvp.findLearnersBySnils(tenantId, identity.snils);
    if (!matches.some((l) => l.id === learnerId)) {
      throw new UnprocessableEntityException({
        code: 'esia_snils_mismatch',
        message: 'СНИЛС в Госуслугах не совпадает с вашими данными'
      });
    }
    const record = this.mvp.approveIdentityViaEsia(tenantId, learnerId, context);
    return { verificationId: record.id, tenantId };
  }
}
