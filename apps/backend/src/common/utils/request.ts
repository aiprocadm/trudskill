import { randomUUID } from 'node:crypto';

import type { RequestContext } from '../context/request-context.js';
import type { Request } from 'express';

export type RequestWithContext = Request & { context?: RequestContext };

export const resolveRequestContext = (req: RequestWithContext): RequestContext => {
  if (!req.context) {
    req.context = {
      requestId: randomUUID(),
      correlationId: req.header('x-correlation-id') ?? randomUUID(),
      requestedTenantId: req.header('x-tenant-id') ?? undefined,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined
    };
  }

  return req.context;
};
