import { Controller, Get, Inject, NotFoundException, Param, Req, Res } from '@nestjs/common';

import { verifyScormContentToken } from './scorm-content-token.js';
import { contentTypeForPath } from './scorm-zip-guards.js';
import { backendEnv } from '../../../env.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';

import type { Request, Response } from 'express';

/**
 * Phase 9 Plan A (D6): serving unpacked SCORM content in an iframe.
 * Auth — HMAC token embedded in the URL path (iframes cannot send custom headers).
 * Relative assets in the course inherit the /scorm-content/<token>/ prefix.
 * No MVP-state read: the S3 key is derived deterministically from the token payload.
 *
 * NestJS 11 / path-to-regexp v8: named wildcard `:token/*rest` captures everything after
 * the token segment as a single string in `req.params.rest` (e.g. "content/index.html").
 * Empirically verified by the integration test.
 *
 * UNGUARDED — no TenantGuard, no MvpRequestPersistenceInterceptor.
 */
@Controller('scorm-content')
export class ScormContentController {
  constructor(@Inject(S3StorageClient) private readonly storage: S3StorageClient) {}

  @Get(':token/*rest')
  async serve(
    @Param('token') token: string,
    @Param('rest') rawRest: unknown,
    @Req() _req: Request,
    @Res() res: Response
  ) {
    const payload = verifyScormContentToken(token, backendEnv.SCORM_CONTENT_TOKEN_SECRET, {
      nowEpochSeconds: Math.floor(Date.now() / 1000)
    });
    if (!payload) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Invalid or expired content token'
      });
    }

    // path-to-regexp v8 delivers named wildcard as a string (e.g. "content/index.html").
    // Be defensive: handle both string and array (future-proofing).
    const restParam = rawRest as string | string[] | undefined;
    const rest = Array.isArray(restParam) ? restParam.join('/') : String(restParam ?? '');

    // Reject path traversal attempts.
    if (!rest || rest.split('/').some((seg) => seg === '..')) {
      throw new NotFoundException({ code: 'not_found', message: 'Not found' });
    }

    const key = `scorm/${payload.tenantId}/${payload.packageId}/${rest}`;
    try {
      const stream = await this.storage.getObjectStream({ key });
      res.setHeader('Content-Type', contentTypeForPath(rest));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      stream.pipe(res);
    } catch {
      throw new NotFoundException({ code: 'not_found', message: 'Not found' });
    }
  }
}
