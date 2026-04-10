import { Module } from '@nestjs/common';

import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';

@Module({
  controllers: [MvpController],
  providers: [MvpService, TenantScopedRepository]
})
export class MvpModule {}
