import { Module } from '@nestjs/common';

import { FilesService } from './files.service.js';
import { backendEnv } from '../../env.js';
import {
  ANTIVIRUS_SCANNER,
  NoopAntivirusScanner
} from '../../infrastructure/antivirus/antivirus.scanner.js';
import { ClamAvAntivirusScanner } from '../../infrastructure/antivirus/clamav-antivirus.scanner.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

@Module({
  imports: [InfrastructureModule],
  providers: [
    FilesService,
    {
      provide: ANTIVIRUS_SCANNER,
      inject: [S3StorageClient],
      useFactory: (storage: S3StorageClient) =>
        backendEnv.ANTIVIRUS_ENABLED
          ? new ClamAvAntivirusScanner(storage, backendEnv.CLAMAV_HOST, backendEnv.CLAMAV_PORT)
          : new NoopAntivirusScanner()
    }
  ],
  exports: [FilesService]
})
export class FilesModule {}
