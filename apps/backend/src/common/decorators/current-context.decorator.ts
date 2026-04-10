import { type ExecutionContext, createParamDecorator } from '@nestjs/common';

import { resolveRequestContext } from '../utils/request.js';

export const CurrentContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return resolveRequestContext(request);
});
