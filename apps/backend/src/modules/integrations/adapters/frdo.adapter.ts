import { Injectable } from '@nestjs/common';
import { BaseAdapter } from './base.adapter.js';

@Injectable()
export class FrdoAdapter extends BaseAdapter {
  readonly providerCode = 'frdo';
}
