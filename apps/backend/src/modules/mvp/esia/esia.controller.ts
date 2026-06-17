// apps/backend/src/modules/mvp/esia/esia.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
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

  /**
   * LOGIN entry — unauthenticated browser top-level navigation. tenant_id comes in the query and is
   * baked into the signed state; the callback reads tenant FROM the state, not the guard context.
   */
  @Get('auth/esia/authorize')
  authorize(
    @Query('tenant_id') tenantId: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): void {
    if (!tenantId)
      throw new BadRequestException({ code: 'esia_no_tenant', message: 'tenant_id is required' });
    const { authorizeUrl } = this.esia.startAuthorize('login', tenantId);
    response.redirect(authorizeUrl); // throws via NoopEsiaProvider (503) when ESIA_ENABLED=false
  }

  /**
   * IDENTITY entry — initiated by the authenticated SPA (bearer present → normal guard resolves
   * userId+tenantId). The learner is baked into the signed state so the (cookie-only) callback can
   * approve without context. Returns the authorize URL as JSON; the SPA navigates to it.
   */
  @Post('auth/esia/identity/authorize')
  identityAuthorize(@CurrentContext() context: RequestContext): { authorizeUrl: string } {
    if (!context.userId || !context.tenantId)
      throw new UnauthorizedException({
        code: 'esia_identity_no_session',
        message: 'Требуется вход'
      });
    const learner = this.mvp.getLinkedLearnerForUser(context.tenantId, context.userId);
    return this.esia.startAuthorize('identity', context.tenantId, learner.id);
  }

  @Get('auth/esia/callback')
  async callback(
    @CurrentContext() context: RequestContext,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    if (!code || !state) {
      response.redirect(frontend('/auth/esia/callback?status=error&reason=missing_params'));
      return;
    }
    // The purpose lives inside the signed state; peek it to branch (verify happens in the service).
    const purpose = this.esia.peekPurpose(state);
    if (purpose === 'identity') {
      await this.esia.approveIdentity(code, state, context);
      response.redirect(frontend('/learner/identity?status=ok'));
      return;
    }
    const { userId, databaseBacked, tenantId } = await this.esia.resolveLoginUser(code, state);
    const user = await this.iamService.getUser(tenantId, userId);
    const tokens = await this.authService.issueSessionForUser(user, context, {
      authMethod: 'esia',
      databaseBacked
    });
    authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
    response.redirect(frontend('/learner?status=esia_ok'));
  }
}
