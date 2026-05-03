import { describe, expect, it } from 'vitest';

import {
  ASSESSMENT_READ_CROSS_LEARNER_PERMISSION,
  LEARNERS_ACT_AS_PERMISSION,
  showActAsLearnerAction,
  showOpenLearnerRegistryAction
} from './assessment-permissions.js';

describe('assessment permission UI gates', () => {
  it('скрывает ссылку на реестр слушателя без assessment.read.cross_learner', () => {
    expect(showOpenLearnerRegistryAction([])).toBe(false);
    expect(showOpenLearnerRegistryAction(['courses.read'])).toBe(false);
    expect(showOpenLearnerRegistryAction([ASSESSMENT_READ_CROSS_LEARNER_PERMISSION])).toBe(true);
  });

  it('скрывает действия делегирования без learners.act_as', () => {
    expect(showActAsLearnerAction([])).toBe(false);
    expect(showActAsLearnerAction([ASSESSMENT_READ_CROSS_LEARNER_PERMISSION])).toBe(false);
    expect(showActAsLearnerAction([LEARNERS_ACT_AS_PERMISSION])).toBe(true);
  });
});
