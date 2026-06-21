import { Module } from '@nestjs/common';

import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { PaymentsController } from './payments.controller.js';
import { PAYMENTS_REPOSITORY } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';
import { PostgresPaymentsRepository } from './postgres-payments.repository.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { FakePaymentProvider } from '../../infrastructure/payments/fake-payment.provider.js';
import {
  NoopPaymentProvider,
  PAYMENT_PROVIDER
} from '../../infrastructure/payments/payment.provider.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';
import { MvpModule } from '../mvp/mvp.module.js';

@Module({
  imports: [InfrastructureModule, AuditModule, IamModule, MvpModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    PaymentsService,
    PaymentFulfillmentService,
    {
      provide: PAYMENTS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryPaymentsRepository()
          : new PostgresPaymentsRepository(db),
      inject: [DatabaseService]
    },
    // Phase 7 payments seam. Ships dormant (PAYMENTS_ENABLED=false → NoopPaymentProvider):
    // online payment is unavailable, but manual bank-transfer mark-paid still works.
    // Mirrors the EXPORT_SIGNATURE_PROVIDER factory in MvpModule.
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => {
        // STAGING: synthetic payment provider for end-to-end QA (env refinement forbids it in prod).
        if (backendEnv.PAYMENTS_ENABLED && backendEnv.PAYMENTS_PROVIDER === 'fake') {
          return new FakePaymentProvider();
        }
        // ЮKassa adapter not implemented yet — fall back to Noop so prod can't silently
        // believe payments are processed. Swap this branch for `new YookassaPaymentProvider(...)`.
        if (backendEnv.PAYMENTS_ENABLED && backendEnv.PAYMENTS_PROVIDER === 'yookassa') {
          console.warn(
            '[payments] PAYMENTS_PROVIDER=yookassa requested but adapter not implemented — using Noop'
          );
        }
        return new NoopPaymentProvider();
      }
    }
  ],
  exports: [PaymentsService]
})
export class PaymentsModule {}
