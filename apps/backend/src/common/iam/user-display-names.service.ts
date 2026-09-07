import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Имена учётных записей по их идентификаторам — для показа человеку.
 *
 * Зачем отдельная служба. Правило продукта №2 запрещает показывать сырой идентификатор, а
 * подставлять имя на стороне экрана нельзя: справочник имён на клиенте врёт на удалённых и
 * на неизвестных записях (этим уже обожглись в журнале действий, ревизия 2026-08-26).
 * Значит имя подставляет сервер — и там, где данные лежат в снимке состояния центра, а не в
 * таблице, соединением этого не сделать: нужен отдельный маленький запрос.
 *
 * Один запрос на страницу, а не на строку: идентификаторы собираются в список и спрашиваются
 * разом. Неизвестный идентификатор просто отсутствует в ответе — вызывающий покажет это
 * прямо, а не подставит правдоподобную неправду вроде «система».
 */
@Injectable()
export class UserDisplayNamesService {
  constructor(@Optional() @Inject(DatabaseService) private readonly db?: DatabaseService) {}

  /** Идентификатор → отображаемое имя. Неизвестные и пустые идентификаторы не возвращаются. */
  async namesOf(
    tenantId: string,
    ids: ReadonlyArray<string | null | undefined>
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id && id.trim())))];
    if (!this.db || wanted.length === 0) return new Map();

    const rows = await this.db.query<{ id: string; display_name: string | null }>(
      `select id, display_name from iam.users where tenant_id = $1 and id = any($2::text[])`,
      [tenantId, wanted]
    );
    const names = new Map<string, string>();
    for (const row of rows) {
      if (row.display_name) names.set(row.id, row.display_name);
    }
    return names;
  }

  /** Готовое поле «кто» для одной записи: имя либо `null`, если учётной записи больше нет. */
  async nameOf(tenantId: string, id: string | null | undefined): Promise<string | null> {
    if (!id) return null;
    return (await this.namesOf(tenantId, [id])).get(id) ?? null;
  }
}
