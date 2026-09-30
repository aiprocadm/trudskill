import { Module } from '@nestjs/common';

import { CDOPROF_SOURCE, envCdoprofSource } from './cdoprof-source.js';
import { ImportCdoprofService } from './import-cdoprof.service.js';
import { ImportLiveExecutor } from './import-live.executor.js';
import { ImportRunsStore } from './import-runs.store.js';
import { ImportCdoprofController } from './import.controller.js';
import { backendEnv } from '../../env.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BackgroundTasksModule } from '../background-tasks/background-tasks.module.js';
import { IamModule } from '../iam/iam.module.js';
import { MvpModule } from '../mvp/mvp.module.js';

/** ТЗ перехода §13.4, Фаза 4: модуль импорта подключается вместе со своей ручкой (РМ15). */
@Module({
  imports: [InfrastructureModule, AuditModule, IamModule, MvpModule, BackgroundTasksModule],
  controllers: [ImportCdoprofController],
  providers: [
    ImportRunsStore,
    ImportCdoprofService,
    ImportLiveExecutor,
    { provide: CDOPROF_SOURCE, useFactory: () => envCdoprofSource(backendEnv) }
  ]
})
export class ImportCdoprofModule {}
