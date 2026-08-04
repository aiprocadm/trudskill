import { Module } from '@nestjs/common';

import { PlatformPlansController } from './platform-plans.controller.js';
import { PlatformPlansService } from './platform-plans.service.js';
import { PlatformTenantsController } from './platform-tenants.controller.js';
import { PlatformTenantsService } from './platform-tenants.service.js';
import { RentalBillingController } from './rental-billing.controller.js';
import { RentalBillingSchedulerService } from './rental-billing.scheduler.service.js';
import { RentalBillingService } from './rental-billing.service.js';
import { backendEnv } from '../../env.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { ManualRentalBillingProvider } from '../../infrastructure/rental-billing/manual-rental-billing.provider.js';
import {
  NoopRentalBillingProvider,
  RENTAL_BILLING_PROVIDER_REGISTRY,
  type RentalBillingProvider,
  type RentalBillingProviderCode,
  type RentalBillingProviderRegistry
} from '../../infrastructure/rental-billing/rental-billing.provider.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

/** ФТ-D2.2/ФТ-D4 — платформенный уровень: арендаторы и тарифы (только platform_admin). */
@Module({
  imports: [InfrastructureModule, IamModule, AuditModule],
  controllers: [PlatformTenantsController, PlatformPlansController, RentalBillingController],
  providers: [
    PlatformTenantsService,
    PlatformPlansService,
    RentalBillingService,
    RentalBillingSchedulerService,
    // ФТ-D5.1: реестр адаптеров биллинга. Рабочий по умолчанию — `manual`
    // («счёт+акт»); `yookassa` подключается вторым адаптером поверх того же шва.
    {
      provide: RENTAL_BILLING_PROVIDER_REGISTRY,
      useFactory: (): RentalBillingProviderRegistry =>
        new Map<RentalBillingProviderCode, RentalBillingProvider>([
          ['noop', new NoopRentalBillingProvider()],
          ['manual', new ManualRentalBillingProvider(backendEnv.GOTENBERG_URL)]
        ])
    }
  ],
  exports: [PlatformTenantsService, PlatformPlansService, RentalBillingService]
})
export class PlatformModule {}
