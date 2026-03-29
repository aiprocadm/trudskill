import { Module } from '@nestjs/common';
import { ProviderRegistry } from '../services/provider-registry.service.js';
import { AdapterResolver } from '../services/adapter-resolver.service.js';
import { FrdoAdapter } from '../adapters/frdo.adapter.js';
import { EisotAdapter } from '../adapters/eisot.adapter.js';
import { EmailAdapter } from '../adapters/email.adapter.js';
import { WebinarAdapter } from '../adapters/webinar.adapter.js';
import { ProctoringAdapter } from '../adapters/proctoring.adapter.js';

@Module({
  providers: [ProviderRegistry, AdapterResolver, FrdoAdapter, EisotAdapter, EmailAdapter, WebinarAdapter, ProctoringAdapter],
  exports: [ProviderRegistry, AdapterResolver, FrdoAdapter, EisotAdapter, EmailAdapter, WebinarAdapter, ProctoringAdapter]
})
export class ProvidersModule {}
