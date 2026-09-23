import { Module } from '@nestjs/common';

import { PostgresTasksRepository } from './postgres-tasks.repository.js';
import { TasksController } from './tasks.controller.js';
import { TASKS_REPOSITORY } from './tasks.repository.js';
import { TASKS_SETTINGS, TasksService } from './tasks.service.js';
import { backendEnv } from '../../env.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

import type { TasksSettings } from './tasks.service.js';

/**
 * Задачи сотрудников (ТЗ перехода с CDOPROF, МГ-G2). Первый модуль в нормализованных
 * таблицах `tasks.*` — образец репозитория для Фазы 1.
 */
@Module({
  imports: [AuditModule, IamModule, InfrastructureModule],
  controllers: [TasksController],
  providers: [
    { provide: TASKS_REPOSITORY, useClass: PostgresTasksRepository },
    {
      provide: TASKS_SETTINGS,
      useFactory: (): TasksSettings => ({
        commentDeleteWindowMinutes: backendEnv.TASKS_COMMENT_DELETE_WINDOW_MINUTES
      })
    },
    TasksService
  ],
  exports: [TasksService, TASKS_REPOSITORY]
})
export class TasksModule {}
