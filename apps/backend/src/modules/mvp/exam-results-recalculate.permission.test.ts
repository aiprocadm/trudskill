import { describe, expect, it } from 'vitest';

import { MvpController } from './mvp.controller.js';
import { REQUIRED_PERMISSIONS } from '../iam/permission.decorator.js';

/**
 * Право на пересчёт результатов экзаменов (журнал 340).
 *
 * `POST /exam-results/recalculate` пересобирает `examResults` ВСЕГО центра: заводит записи,
 * переписывает `passed`/`status`/`updatedAt` и в аудит ничего не пишет. Стояло
 * `assessment.results.read` — право «смотреть результаты», которое сиды 0038 и 0084 выдают
 * слушателю и преподавателю. Результат выводится из правил теста (проходной балл), поэтому
 * пересчитывать его может тот, кто эти правила ведёт: `assessment.tests.write` — администрация
 * и методист (0010).
 */
describe('MvpController — пересчёт результатов экзаменов требует права вести тесты', () => {
  it('recalculateExamResults закрыт assessment.tests.write, а не results.read', () => {
    const required = Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      MvpController.prototype.recalculateExamResults
    ) as string[] | undefined;
    expect(required).toEqual(['assessment.tests.write']);
  });
});
