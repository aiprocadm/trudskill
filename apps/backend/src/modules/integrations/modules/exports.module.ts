import { Module } from '@nestjs/common';

import { IdempotencyService } from '../services/idempotency.service.js';

@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService]
})
export class ExportsModule {}
