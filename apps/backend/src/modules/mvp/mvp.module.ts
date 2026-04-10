import { Module } from '@nestjs/common';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';

@Module({
  controllers: [MvpController],
  providers: [
    { provide: MVP_STATE, useClass: InMemoryMvpState },
    MvpService,
    TenantScopedRepository
  ]
})
export class MvpModule {}
