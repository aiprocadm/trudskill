import { Injectable } from '@nestjs/common';

import type {
  Credential,
  ExportItem,
  ExportTask,
  Provider,
  SyncLog
} from '../integrations.types.js';

@Injectable()
export class InMemoryIntegrationOrchestratorState {
  providers: Provider[] = [];
  credentials: Credential[] = [];
  tasks: ExportTask[] = [];
  items: ExportItem[] = [];
  logs: SyncLog[] = [];
  idempotencyInFlight = new Set<string>();
}
