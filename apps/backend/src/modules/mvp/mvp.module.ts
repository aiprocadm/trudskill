import { Module, Scope } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MemoryMvpPersistenceBackend } from './infrastructure/memory-mvp-persistence.backend.js';
import { MvpPersistenceRepositoryAdapter } from './infrastructure/mvp-persistence.repository.adapter.js';
import { MVP_PERSISTENCE_BACKEND } from './infrastructure/mvp-persistence.token.js';
import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { PostgresMvpPersistenceBackend } from './infrastructure/postgres-mvp-persistence.backend.js';
import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { FilesModule } from '../files/files.module.js';
import { IamModule } from '../iam/iam.module.js';

const persistenceBackendClass =
  backendEnv.MVP_PERSISTENCE_DRIVER === 'postgres'
    ? MvpPersistenceRepositoryAdapter
    : MemoryMvpPersistenceBackend;

@Module({
  imports: [InfrastructureModule, FilesModule, IamModule],
  controllers: [MvpController],
  providers: [
    PostgresMvpPersistenceBackend,
    { provide: MVP_PERSISTENCE_BACKEND, useClass: persistenceBackendClass },
    { provide: MVP_STATE, scope: Scope.REQUEST, useClass: InMemoryMvpState },
    { provide: MvpService, scope: Scope.REQUEST, useClass: MvpService },
    {
      provide: MvpRequestPersistenceInterceptor,
      scope: Scope.REQUEST,
      useClass: MvpRequestPersistenceInterceptor
    }
  ]
})
export class MvpModule {}
