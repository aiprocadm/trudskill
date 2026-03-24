import { Injectable } from '@nestjs/common';

@Injectable()
export class DatabaseService {
  async ping(): Promise<boolean> {
    return true;
  }
}
