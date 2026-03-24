import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { FilesService } from './files.service.js';

@Module({
  imports: [InfrastructureModule],
  providers: [FilesService],
  exports: [FilesService]
})
export class FilesModule {}
