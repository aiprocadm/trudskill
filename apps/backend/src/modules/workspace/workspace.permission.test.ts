import { describe, expect, it } from 'vitest';

import { WorkspaceController } from './workspace.controller.js';
import { REQUIRED_PERMISSIONS } from '../iam/permission.decorator.js';

/**
 * Рабочий стол сотрудника — под своим правом, а не под `tenant.read` (журнал 342, 343).
 *
 * `tenant.read` есть у КАЖДОЙ роли, включая слушателя: это право видеть карточку своего
 * центра. Под ним же стояли сводка оперативной панели, входящие задачи и блокеры — и
 * слушатель читал черновики курсов, задачи по документам и сбои выдачи всего центра.
 * Право `workspace.read` заведено миграцией 0091 всем ролям центра, кроме слушателя, и
 * стоит на экране `/workspace` — дверь и стена совпадают.
 */
describe('WorkspaceController — рабочий стол сотрудника закрыт правом workspace.read', () => {
  it.each(['getSummary', 'getTasksInbox', 'getBlockers'] as const)(
    '%s требует workspace.read',
    (method) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS, WorkspaceController.prototype[method])
      ).toEqual(['workspace.read']);
    }
  );
});
