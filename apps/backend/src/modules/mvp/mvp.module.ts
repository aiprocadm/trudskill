import { Module } from '@nestjs/common';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';

@Module({
  controllers: [MvpController],
  providers: [MvpService, TenantScopedRepository]
})
export class MvpModule {}
