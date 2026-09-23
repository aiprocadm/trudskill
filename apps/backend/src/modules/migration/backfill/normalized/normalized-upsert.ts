import type { ColumnType, ProjectedRow, TableSpec } from './normalized-projection.js';
import type { PoolClient } from 'pg';

/**
 * Запись спроецированных строк в нормализованные таблицы (Фаза 1 ТЗ перехода с CDOPROF).
 *
 * Общий код для двух писателей: бэкфилла «снимок → таблицы» (срез 0b) и проекции при
 * сохранении снимка (срез 1a). Оба берут строку из `projectEntity` и кладут её upsert-ом по
 * `id`; обновление разрешено только в пределах того же центра — если строка с таким `id`
 * принадлежит другому центру, ничего не пишется и вызывающий получает ошибку, а не тихий
 * пропуск. Все функции работают на переданном `PoolClient`: транзакцию и точки сохранения
 * держит вызывающий.
 */

export const CAST: Record<ColumnType, string> = {
  text: '::text',
  num: '::numeric',
  int: '::int',
  bool: '::boolean',
  ts: '::timestamptz',
  date: '::date',
  json: '::jsonb'
};

const VALUES_CHUNK = 500;

/** Колонки, которые пишет upsert: объявленные в спецификации и присутствующие в строке, плюс payload. */
const columnNames = (spec: TableSpec, row: ProjectedRow): string[] => {
  const names = Object.keys(spec.columns).filter((name) => name in row.columns);
  if (spec.hasPayload) names.push('payload');
  return names;
};

const bindValue = (spec: TableSpec, row: ProjectedRow, name: string): unknown => {
  if (name === 'payload') return JSON.stringify(row.payload);
  const value = row.columns[name];
  if (value === null || value === undefined) return null;
  return spec.columns[name] === 'json' ? JSON.stringify(value) : value;
};

const placeholder = (spec: TableSpec, name: string, index: number): string => {
  const cast = name === 'payload' ? '::jsonb' : CAST[spec.columns[name]!];
  const bound = `$${index}${cast}`;
  // created_at/updated_at у сущности может не быть — тогда их проставляет база.
  return name === 'created_at' || name === 'updated_at' ? `coalesce(${bound}, now())` : bound;
};

/**
 * Пачка строк одной таблицы одним `insert … values (…), (…)`; строки должны иметь одинаковый
 * набор колонок (у одной коллекции он одинаков по построению проекции).
 */
export async function upsertRows(
  client: PoolClient,
  spec: TableSpec,
  rows: ProjectedRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const names = columnNames(spec, rows[0]!);
  const updates = names
    .filter((name) => name !== 'id' && name !== 'tenant_id' && name !== 'created_at')
    .map((name) => `${name} = excluded.${name}`);

  for (let start = 0; start < rows.length; start += VALUES_CHUNK) {
    const chunk = rows.slice(start, start + VALUES_CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const cells = names.map((name) => {
        params.push(bindValue(spec, row, name));
        return placeholder(spec, name, params.length);
      });
      return `(${cells.join(', ')})`;
    });
    const result = await client.query(
      `insert into ${spec.table} (${names.join(', ')})
       values ${tuples.join(', ')}
       on conflict (id) do update set ${updates.join(', ')}
       where ${spec.table}.tenant_id = excluded.tenant_id`,
      params
    );
    if ((result.rowCount ?? 0) < chunk.length) {
      throw new Error(
        `${spec.table}: ${chunk.length - (result.rowCount ?? 0)} строк не записано — идентификатор уже принадлежит другому центру`
      );
    }
  }
}

export async function upsertRow(
  client: PoolClient,
  spec: TableSpec,
  row: ProjectedRow
): Promise<void> {
  await upsertRows(client, spec, [row]);
}

export async function deleteRows(
  client: PoolClient,
  spec: TableSpec,
  tenantId: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  await client.query(`delete from ${spec.table} where tenant_id = $1 and id = any($2::text[])`, [
    tenantId,
    ids
  ]);
}

/** Убрать из таблицы центра всё, чего нет в снимке (после присваивания коллекции целиком). */
export async function deleteAbsent(
  client: PoolClient,
  spec: TableSpec,
  tenantId: string,
  keepIds: string[]
): Promise<void> {
  await client.query(
    `delete from ${spec.table} where tenant_id = $1 and not (id = any($2::text[]))`,
    [tenantId, keepIds]
  );
}

/** Какие из контрагентов центра есть в таблице — для проекции групп (составной FK). */
export async function loadCounterpartyIds(
  client: PoolClient,
  tenantId: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const found = await client.query<{ id: string }>(
    'select id from crm.counterparties where tenant_id = $1 and id = any($2::text[])',
    [tenantId, ids]
  );
  return new Set(found.rows.map((r) => r.id));
}

/**
 * Отвязать группы таблицы от контрагентов, которые уходят (`deleted`) или которых больше нет в
 * снимке (`keep` — остальные). Ссылка обнуляется, исходное значение — в `payload.counterpartyId`,
 * ровно как это делает проекция группы с неизвестным контрагентом. Иначе `delete` контрагента
 * упал бы на внешнем ключе, хотя в снимке группу никто не трогал.
 */
export async function detachGroupsFromCounterparties(
  client: PoolClient,
  tenantId: string,
  scope: { deleted: string[] } | { keep: string[] }
): Promise<void> {
  if ('deleted' in scope) {
    if (scope.deleted.length === 0) return;
    await client.query(
      `update learning.groups
          set counterparty_id = null,
              payload = payload || jsonb_build_object('counterpartyId', counterparty_id),
              updated_at = now()
        where tenant_id = $1 and counterparty_id = any($2::text[])`,
      [tenantId, scope.deleted]
    );
    return;
  }
  await client.query(
    `update learning.groups
        set counterparty_id = null,
            payload = payload || jsonb_build_object('counterpartyId', counterparty_id),
            updated_at = now()
      where tenant_id = $1 and counterparty_id is not null and not (counterparty_id = any($2::text[]))`,
    [tenantId, scope.keep]
  );
}

/** Какие из учётных записей центра существуют — для `learners.user_id` (уникальный частичный индекс 0110). */
export async function loadUserIds(
  client: PoolClient,
  tenantId: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const found = await client.query<{ id: string }>(
    'select id from iam.users where tenant_id = $1 and id = any($2::text[])',
    [tenantId, ids]
  );
  return new Set(found.rows.map((r) => r.id));
}

/**
 * История статусов подчинена зачислению: перед удалением зачислений (`deleted`) или чисткой
 * лишних (`keep` — остальные) убрать их историю, иначе `delete` упрётся во внешний ключ.
 */
export async function detachHistoryFromEnrollments(
  client: PoolClient,
  tenantId: string,
  scope: { deleted: string[] } | { keep: string[] }
): Promise<void> {
  if ('deleted' in scope) {
    if (scope.deleted.length === 0) return;
    await client.query(
      `delete from learning.enrollment_status_history
        where tenant_id = $1 and enrollment_id = any($2::text[])`,
      [tenantId, scope.deleted]
    );
    return;
  }
  await client.query(
    `delete from learning.enrollment_status_history
      where tenant_id = $1 and not (enrollment_id = any($2::text[]))`,
    [tenantId, scope.keep]
  );
}
