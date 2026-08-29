import { ConflictException } from '@nestjs/common';

import type { PoolClient } from 'pg';

const TABLE = 'documents.issued_number_claims';

/** Резервирование глазами заявки: только номер и его владелец. */
export interface NumberClaimInput {
  id: string;
  reservedNumber: string;
}

/**
 * Дубль номера документа: номер уже заявлен ДРУГИМ резервированием.
 *
 * Наследник `ConflictException`, поэтому доезжает до клиента как 409 без отдельного
 * отображения ошибок. Текст объясняет человеку суть, технические подробности — в журнале.
 */
export class DuplicateDocumentNumberError extends ConflictException {
  constructor(
    readonly tenantId: string,
    readonly reservedNumber: string
  ) {
    super({
      code: 'duplicate_document_number',
      message:
        `Номер ${reservedNumber} уже занят другим документом. Документ не выпущен — ` +
        'повторите выпуск, номер будет выдан следующий.'
    });
  }
}

/**
 * Заявить номера в базе (журнал 272). Последняя линия обороны от дубля номера.
 *
 * Уникальность номера держалась на проверке в ПАМЯТИ процесса: два экземпляра приложения
 * могли выпустить два удостоверения с одним номером. Ключ таблицы `(tenant_id,
 * reserved_number)` делает это невозможным физически.
 *
 * Два запроса независимо от числа резервирований:
 *  1) вставить все заявки, пропуская уже существующие;
 *  2) прочитать владельцев наших номеров и убедиться, что все — наши.
 *
 * Повторная заявка тем же резервированием законна: освобождённый номер переиспользуется
 * ТЕМ ЖЕ резервированием, и его заявка просто остаётся на месте.
 */
export async function claimIssuedNumbers(
  client: PoolClient,
  tenantId: string,
  reservations: readonly NumberClaimInput[]
): Promise<void> {
  const claims = reservations.filter((item) => Boolean(item.reservedNumber) && Boolean(item.id));
  if (claims.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = claims.map((claim, index) => {
    const base = index * 3;
    values.push(tenantId, claim.reservedNumber, claim.id);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  await client.query(
    `insert into ${TABLE} (tenant_id, reserved_number, reservation_id)
     values ${placeholders.join(', ')}
     on conflict (tenant_id, reserved_number) do nothing`,
    values
  );

  const owners = await client.query<{ reserved_number: string; reservation_id: string }>(
    `select reserved_number, reservation_id from ${TABLE}
      where tenant_id = $1 and reserved_number = any($2::text[])`,
    [tenantId, claims.map((claim) => claim.reservedNumber)]
  );

  const ownerByNumber = new Map(
    owners.rows.map((row) => [row.reserved_number, row.reservation_id])
  );
  for (const claim of claims) {
    const owner = ownerByNumber.get(claim.reservedNumber);
    if (owner !== undefined && owner !== claim.id) {
      throw new DuplicateDocumentNumberError(tenantId, claim.reservedNumber);
    }
  }
}
