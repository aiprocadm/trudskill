import { Module } from '@nestjs/common';

import { InMemorySavedViewsRepository } from './in-memory-saved-views.repository.js';
import { PostgresSavedViewsRepository } from './postgres-saved-views.repository.js';
import { SavedViewsController } from './saved-views.controller.js';
import { SAVED_VIEWS_REPOSITORY } from './saved-views.repository.js';
import { SavedViewsService } from './saved-views.service.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

/** Сохранённые представления реестров (МГ-H4.1, срез 11.3) — по образцу `lookup`: репозиторий по режиму хранения. */
@Module({
  imports: [AuditModule, IamModule, InfrastructureModule],
  controllers: [SavedViewsController],
  providers: [
    {
      provide: SAVED_VIEWS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemorySavedViewsRepository()
          : new PostgresSavedViewsRepository(db),
      inject: [DatabaseService]
    },
    SavedViewsService
  ],
  exports: [SavedViewsService]
})
export class SavedViewsModule {}
