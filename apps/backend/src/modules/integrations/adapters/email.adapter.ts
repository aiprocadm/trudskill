import { Injectable } from '@nestjs/common';
import { BaseAdapter } from './base.adapter.js';

@Injectable()
export class EmailAdapter extends BaseAdapter {
  readonly providerCode = 'email';
}
