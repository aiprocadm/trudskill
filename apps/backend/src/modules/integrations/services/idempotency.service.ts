import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  private readonly records = new Map<string, unknown>();
  get<T>(key: string): T | null { return (this.records.get(key) as T | undefined) ?? null; }
  remember<T>(key: string, value: T): T { this.records.set(key, value); return value; }
  enforceNew(key: string): void { if (this.records.has(key)) throw new ConflictException({ code: 'conflict', message: 'Duplicate idempotent operation' }); }
}
