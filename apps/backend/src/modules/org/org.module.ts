import { Module, Scope } from '@nestjs/common';

import { InMemoryOrgState } from './in-memory-org.state.js';
import { LicensesController } from './licenses.controller.js';
import { LicensesService } from './licenses.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

@Module({
  imports: [AuditModule, IamModule],
  controllers: [LicensesController],
  providers: [
    { provide: InMemoryOrgState, scope: Scope.REQUEST, useClass: InMemoryOrgState },
    { provide: LicensesService, scope: Scope.REQUEST, useClass: LicensesService }
  ],
  exports: [LicensesService]
})
export class OrgModule {}
