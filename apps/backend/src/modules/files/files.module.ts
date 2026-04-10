import { Module } from '@nestjs/common';

import { FilesService } from './files.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  providers: [FilesService],
  exports: [FilesService]
})
export class FilesModule {}
