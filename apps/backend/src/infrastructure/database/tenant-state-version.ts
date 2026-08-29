import { ConflictException } from '@nestjs/common';

import type { PoolClient } from 'pg';

/** Какой снимок состояния версионируется. У них разные транзакции записи — и разные версии. */
export type TenantStateScope = 'mvp' | 'documents';

const TABLE = 'core.tenant_state_versions';

/**
 * Версия снимка состояния арендатора (журнал 272/292).
 *
 * Состояние хранится снимком, а сохранение переписывает коллекцию целиком. Порядок
 * «прочитать → изменить → записать» сериализован замком арендатора, но замок держит очередь
 * в ПАМЯТИ ПРОЦЕССА: второй экземпляр за прокси не защищён ничем, и «последний писатель
 * побеждает» стирает чужие изменения молча.
 *
 * Версия — дешёвая замена сквозной блокировке. Соединение никто не держит: загрузка
 * запоминает версию, запись увеличивает её УСЛОВНО в своей же транзакции.
 */

/** Версия на момент чтения. Нет строки — снимок ещё ни разу не писали, это версия 0. */
export async function readTenantStateVersion(
  run: (sql: string, params: unknown[]) => Promise<Array<{ version: string | number }>>,
  tenantId: string,
  scope: TenantStateScope
): Promise<number> {
  const rows = await run(`select version from ${TABLE} where tenant_id = $1 and scope = $2`, [
    tenantId,
    scope
  ]);
  const raw = rows[0]?.version;
  return raw === undefined ? 0 : Number(raw);
}

/**
 * Увеличить версию, если она всё ещё та, что прочитали. Ноль строк в ответе означает, что
 * между чтением и записью снимок поменял кто-то другой — записывать поверх нельзя.
 *
 * Один запрос делает и «первую запись» (строки ещё нет — вставка с версией 1), и обычный
 * шаг. Если строка есть, а версия не совпала, `where` у ветки конфликта не выполняется:
 * не вставится и не обновится ничего.
 */
export async function bumpTenantStateVersion(
  client: PoolClient,
  tenantId: string,
  scope: TenantStateScope,
  versionAtLoad: number
): Promise<void> {
  const result = await client.query(
    `insert into ${TABLE} (tenant_id, scope, version)
     values ($1, $2, 1)
     on conflict (tenant_id, scope) do update
        set version = ${TABLE}.version + 1, updated_at = now()
      where ${TABLE}.version = $3
     returning version`,
    [tenantId, scope, versionAtLoad]
  );

  if (result.rowCount === 0) {
    throw new TenantStateConflictError(tenantId, scope);
  }
}

/**
 * Конфликт параллельной записи. Наследник `ConflictException`, поэтому доезжает до клиента
 * как 409 без отдельного отображения ошибок, а текст объясняет человеку, что делать
 * (правило продукта: ошибка говорит, что произошло и что дальше).
 */
export class TenantStateConflictError extends ConflictException {
  constructor(
    readonly tenantId: string,
    readonly scope: TenantStateScope
  ) {
    super({
      code: 'tenant_state_conflict',
      message:
        'Данные центра изменил кто-то ещё, пока вы работали. Обновите страницу и повторите — ' +
        'иначе ваша правка стёрла бы чужую.'
    });
  }
}
