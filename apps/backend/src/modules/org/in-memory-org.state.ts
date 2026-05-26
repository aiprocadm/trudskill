import { Injectable } from '@nestjs/common';

import type { TrainingLicense } from './licenses.types.js';

@Injectable()
export class InMemoryOrgState {
  licenses: TrainingLicense[] = [];
}
