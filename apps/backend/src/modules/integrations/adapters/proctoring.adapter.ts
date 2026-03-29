import { Injectable } from '@nestjs/common';
import { BaseAdapter } from './base.adapter.js';

@Injectable()
export class ProctoringAdapter extends BaseAdapter {
  readonly providerCode = 'proctoring';
}
