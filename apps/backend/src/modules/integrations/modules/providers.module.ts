import { Module } from '@nestjs/common';

import { EisotAdapter } from '../adapters/eisot.adapter.js';
import { EmailAdapter } from '../adapters/email.adapter.js';
import { FrdoAdapter } from '../adapters/frdo.adapter.js';
import { ProctoringAdapter } from '../adapters/proctoring.adapter.js';
import { WebinarAdapter } from '../adapters/webinar.adapter.js';
import { AdapterResolver } from '../services/adapter-resolver.service.js';
import { ProviderRegistry } from '../services/provider-registry.service.js';

@Module({
  providers: [ProviderRegistry, AdapterResolver, FrdoAdapter, EisotAdapter, EmailAdapter, WebinarAdapter, ProctoringAdapter],
  exports: [ProviderRegistry, AdapterResolver, FrdoAdapter, EisotAdapter, EmailAdapter, WebinarAdapter, ProctoringAdapter]
})
export class ProvidersModule {}
