import { describe, expect, it } from 'vitest';

import { FrdoRegistryController } from './frdo-registry.controller.js';

import type { FrdoRegistryService } from './frdo-registry.service.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { UserDisplayNamesService } from '../../../common/iam/user-display-names.service.js';

/**
 * §5.432: кто собрал выгрузку в государственный реестр — видно человеку.
 *
 * Пакеты живут в снимке состояния центра, а не в таблице, поэтому имя не подставить
 * соединением, как в журнале действий: контроллер спрашивает имена разом по всей странице.
 * Проверяется именно это место — оно и есть исполнитель обещания «сырой идентификатор
 * человеку не показывается» (правило продукта №2).
 */
const ctx = { tenantId: 'tenant_a', userId: 'u_admin' } as RequestContext;

const make = (batches: Array<{ id: string; generatedBy: string }>, names: Map<string, string>) => {
  const asked: Array<{ tenantId: string; ids: readonly unknown[] }> = [];
  const service = { listBatches: () => batches } as unknown as FrdoRegistryService;
  const userNames = {
    namesOf: async (tenantId: string, ids: readonly unknown[]) => {
      asked.push({ tenantId, ids });
      return names;
    }
  } as unknown as UserDisplayNamesService;
  return { controller: new FrdoRegistryController(service, userNames), asked };
};

describe('список выгрузок ФРДО называет, кто их собрал', () => {
  it('подставляет имя вместо идентификатора', async () => {
    const { controller, asked } = make(
      [
        { id: 'b1', generatedBy: 'u1' },
        { id: 'b2', generatedBy: 'u2' }
      ],
      new Map([
        ['u1', 'Иванов И.'],
        ['u2', 'Петров П.']
      ])
    );

    const items = (await controller.listExports(ctx)) as Array<{ generatedByName: string | null }>;

    expect(items[0]!.generatedByName).toBe('Иванов И.');
    expect(items[1]!.generatedByName).toBe('Петров П.');
    // Один запрос имён на всю страницу, и только по своему центру.
    expect(asked).toHaveLength(1);
    expect(asked[0]!.tenantId).toBe('tenant_a');
  });

  it('удалённая учётная запись оставляет имя пустым, а не выдуманным', async () => {
    // Экран скажет «учётная запись удалена» — это честнее правдоподобной «системы».
    const { controller } = make([{ id: 'b1', generatedBy: 'u_gone' }], new Map());

    const items = (await controller.listExports(ctx)) as Array<{
      generatedBy: string;
      generatedByName: string | null;
    }>;

    expect(items[0]!.generatedBy).toBe('u_gone');
    expect(items[0]!.generatedByName).toBeNull();
  });
});
