import { Injectable } from '@nestjs/common';
import { BaseAdapter } from './base.adapter.js';

@Injectable()
export class WebinarAdapter extends BaseAdapter {
  readonly providerCode = 'webinar';
}
