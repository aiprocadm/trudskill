import { Injectable } from '@nestjs/common';
import { backendEnv } from '../../env.js';
import { checkTcpEndpoint } from '../health/tcp-check.util.js';

@Injectable()
export class DatabaseService {
  async ping(): Promise<boolean> {
    return checkTcpEndpoint(backendEnv.DATABASE_URL);
  }
}
