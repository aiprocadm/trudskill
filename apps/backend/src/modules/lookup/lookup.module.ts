import { Module } from '@nestjs/common';

import { InMemoryLookupRepository } from './in-memory-lookup.repository.js';
import { LookupController } from './lookup.controller.js';
import { LOOKUP_REPOSITORY } from './lookup.repository.js';
import { LookupService } from './lookup.service.js';
import { PostgresLookupRepository } from './postgres-lookup.repository.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

/**
 * Справочники личного дела (ТЗ перехода МГ-C1.2, срез 8.13): должности центра с
 * автопополнением, уровни образования ФРДО, страны. Образец — `modules/tasks`.
 */
@Module({
  imports: [AuditModule, IamModule, InfrastructureModule],
  controllers: [LookupController],
  providers: [
    {
      provide: LOOKUP_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryLookupRepository()
          : new PostgresLookupRepository(db),
      inject: [DatabaseService]
    },
    LookupService
  ],
  exports: [LookupService, LOOKUP_REPOSITORY]
})
export class LookupModule {}
