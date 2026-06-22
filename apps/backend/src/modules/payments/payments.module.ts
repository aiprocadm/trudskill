import { Module } from '@nestjs/common';

import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';
import { InMemoryPaymentsRepository } from './in-memory-payments.repository.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { PaymentProviderResolver } from './payment-provider-resolver.service.js';
import { PAYMENT_PROVIDER_SETTINGS_REPOSITORY } from './payment-provider-settings.repository.js';
import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { PaymentsController } from './payments.controller.js';
import { PAYMENTS_REPOSITORY } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';
import { PostgresPaymentProviderSettingsRepository } from './postgres-payment-provider-settings.repository.js';
import { PostgresPaymentsRepository } from './postgres-payments.repository.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { CloudPaymentsProvider } from '../../infrastructure/payments/cloudpayments-payment.provider.js';
import { FakePaymentProvider } from '../../infrastructure/payments/fake-payment.provider.js';
import {
  NoopPaymentProvider,
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProvider,
  type PaymentProviderCode,
  type PaymentProviderRegistry
} from '../../infrastructure/payments/payment.provider.js';
import { RobokassaProvider } from '../../infrastructure/payments/robokassa-payment.provider.js';
import { TinkoffPaymentProvider } from '../../infrastructure/payments/tinkoff-payment.provider.js';
import { YookassaPaymentProvider } from '../../infrastructure/payments/yookassa-payment.provider.js';
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
    {
      provide: PAYMENT_PROVIDER_SETTINGS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryPaymentProviderSettingsRepository()
          : new PostgresPaymentProviderSettingsRepository(db),
      inject: [DatabaseService]
    },
    PaymentProviderSettingsService,
    {
      // Phase 7 multi-provider registry. The ACTIVE provider is chosen per-tenant by
      // PaymentProviderResolver. Ships dormant (PAYMENTS_ENABLED=false → resolver always Noop).
      // Real adapters are added in later tasks (credential-gated).
      provide: PAYMENT_PROVIDER_REGISTRY,
      useFactory: (): PaymentProviderRegistry => {
        const reg = new Map<PaymentProviderCode, PaymentProvider>([
          ['noop', new NoopPaymentProvider()],
          ['fake', new FakePaymentProvider()]
        ]);
        if (backendEnv.YOOKASSA_SHOP_ID && backendEnv.YOOKASSA_SECRET_KEY) {
          reg.set(
            'yookassa',
            new YookassaPaymentProvider({
              shopId: backendEnv.YOOKASSA_SHOP_ID,
              secretKey: backendEnv.YOOKASSA_SECRET_KEY,
              returnUrl: backendEnv.YOOKASSA_RETURN_URL,
              apiBase: backendEnv.YOOKASSA_API_BASE,
              allowedIps: backendEnv.YOOKASSA_WEBHOOK_IPS.split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              ipCheckEnabled: backendEnv.YOOKASSA_WEBHOOK_IP_CHECK
            })
          );
        } else if (backendEnv.PAYMENTS_ENABLED) {
          console.warn('[payments] yookassa not registered — YOOKASSA_SHOP_ID/SECRET_KEY missing');
        }
        if (backendEnv.TINKOFF_TERMINAL_KEY && backendEnv.TINKOFF_PASSWORD) {
          reg.set(
            'tinkoff',
            new TinkoffPaymentProvider({
              terminalKey: backendEnv.TINKOFF_TERMINAL_KEY,
              password: backendEnv.TINKOFF_PASSWORD,
              apiBase: backendEnv.TINKOFF_API_BASE,
              successUrl: backendEnv.TINKOFF_SUCCESS_URL
            })
          );
        } else if (backendEnv.PAYMENTS_ENABLED) {
          console.warn('[payments] tinkoff not registered — TINKOFF_TERMINAL_KEY/PASSWORD missing');
        }
        if (backendEnv.CLOUDPAYMENTS_PUBLIC_ID && backendEnv.CLOUDPAYMENTS_API_SECRET) {
          reg.set(
            'cloudpayments',
            new CloudPaymentsProvider({
              publicId: backendEnv.CLOUDPAYMENTS_PUBLIC_ID,
              apiSecret: backendEnv.CLOUDPAYMENTS_API_SECRET,
              apiBase: backendEnv.CLOUDPAYMENTS_API_BASE
            })
          );
        } else if (backendEnv.PAYMENTS_ENABLED) {
          console.warn(
            '[payments] cloudpayments not registered — CLOUDPAYMENTS_PUBLIC_ID/API_SECRET missing'
          );
        }
        if (
          backendEnv.ROBOKASSA_MERCHANT_LOGIN &&
          backendEnv.ROBOKASSA_PASSWORD_1 &&
          backendEnv.ROBOKASSA_PASSWORD_2
        ) {
          reg.set(
            'robokassa',
            new RobokassaProvider({
              merchantLogin: backendEnv.ROBOKASSA_MERCHANT_LOGIN,
              password1: backendEnv.ROBOKASSA_PASSWORD_1,
              password2: backendEnv.ROBOKASSA_PASSWORD_2,
              payUrl: backendEnv.ROBOKASSA_PAY_URL
            })
          );
        } else if (backendEnv.PAYMENTS_ENABLED) {
          console.warn(
            '[payments] robokassa not registered — ROBOKASSA_MERCHANT_LOGIN/PASSWORD_1/PASSWORD_2 missing'
          );
        }
        return reg;
      }
    },
    PaymentProviderResolver
  ],
  exports: [PaymentsService]
})
export class PaymentsModule {}
