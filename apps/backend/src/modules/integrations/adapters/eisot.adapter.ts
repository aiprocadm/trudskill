import { Injectable } from '@nestjs/common';

import { BaseAdapter } from './base.adapter.js';

@Injectable()
export class EisotAdapter extends BaseAdapter {
  readonly providerCode = 'eisot';
}
