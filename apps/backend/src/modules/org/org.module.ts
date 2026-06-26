import { Module } from '@nestjs/common';

import { LicensesController } from './licenses.controller.js';
import { LICENSES_REPOSITORY } from './licenses.repository.js';
import { LicensesService } from './licenses.service.js';
import { PostgresLicensesRepository } from './postgres-licenses.repository.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

@Module({
  imports: [AuditModule, IamModule, InfrastructureModule],
  controllers: [LicensesController],
  providers: [
    { provide: LICENSES_REPOSITORY, useClass: PostgresLicensesRepository },
    LicensesService
  ],
  exports: [LicensesService, LICENSES_REPOSITORY]
})
export class OrgModule {}
