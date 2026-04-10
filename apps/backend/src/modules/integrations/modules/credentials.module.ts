import { Module } from '@nestjs/common';

import { IntegrationCryptoService } from '../services/integration-crypto.service.js';

@Module({
  providers: [IntegrationCryptoService],
  exports: [IntegrationCryptoService]
})
export class CredentialsModule {}
