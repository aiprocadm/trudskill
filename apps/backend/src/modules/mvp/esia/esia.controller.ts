// apps/backend/src/modules/mvp/esia/esia.controller.ts
import {
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { EsiaService } from './esia.service.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { backendEnv } from '../../../env.js';
import { authCookie } from '../../iam/auth-cookie.util.js';
import { AuthService } from '../../iam/services/auth.service.js';
import { IamService } from '../../iam/services/iam.service.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { EsiaPurpose } from '../../../infrastructure/esia/esia-identity.provider.js';
import type { Response } from 'express';

const frontend = (path: string): string => `${backendEnv.ESIA_FRONTEND_REDIRECT_BASE}${path}`;

@Controller()
@UseGuards(TenantGuard)
@UseInterceptors(MvpRequestPersistenceInterceptor)
export class EsiaController {
  constructor(
    @Inject(EsiaService) private readonly esia: EsiaService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(IamService) private readonly iamService: IamService,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  @Get('auth/esia/authorize')
  authorize(
    @CurrentContext() context: RequestContext,
    @Query('purpose') purposeRaw: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): void {
    if (!context.tenantId)
      throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
    const purpose: EsiaPurpose = purposeRaw === 'identity' ? 'identity' : 'login';
    const { authorizeUrl } = this.esia.startAuthorize(purpose, context.tenantId);
    response.redirect(authorizeUrl); // throws via NoopEsiaProvider (503) when ESIA_ENABLED=false
  }

  @Get('auth/esia/callback')
  async callback(
    @CurrentContext() context: RequestContext,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    if (!context.tenantId)
      throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
    if (!code || !state) {
      response.redirect(frontend('/auth/esia/callback?status=error&reason=missing_params'));
      return;
    }
    // The purpose lives inside the signed state; peek it to branch (verify happens in the service).
    const purpose = this.esia.peekPurpose(state);
    if (purpose === 'identity') {
      // identity flow requires an authenticated learner
      if (!context.userId)
        throw new UnauthorizedException({
          code: 'esia_identity_no_session',
          message: 'Требуется вход'
        });
      const learner = this.mvp.getLinkedLearnerForUser(context.tenantId, context.userId);
      await this.esia.approveIdentity(context.tenantId, learner.id, code, state, context);
      response.redirect(frontend('/learner/identity?status=ok'));
      return;
    }
    const { userId, databaseBacked } = await this.esia.resolveLoginUser(
      context.tenantId,
      code,
      state
    );
    const user = await this.iamService.getUser(context.tenantId, userId);
    const tokens = await this.authService.issueSessionForUser(user, context, {
      authMethod: 'esia',
      databaseBacked
    });
    authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
    response.redirect(frontend('/learner?status=esia_ok'));
  }
}
