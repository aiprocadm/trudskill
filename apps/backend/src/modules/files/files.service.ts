import { Injectable } from '@nestjs/common';

export interface FileMetadata {
  id: string;
  tenantId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

@Injectable()
export class FilesService {
  private readonly files: FileMetadata[] = [];

  register(metadata: Omit<FileMetadata, 'id' | 'createdAt'>): FileMetadata {
    const record: FileMetadata = {
      ...metadata,
      id: `file_${this.files.length + 1}`,
      createdAt: new Date().toISOString()
    };

    this.files.push(record);
    return record;
  }

  getByTenant(tenantId: string): FileMetadata[] {
    return this.files.filter((file) => file.tenantId === tenantId);
  }
}
