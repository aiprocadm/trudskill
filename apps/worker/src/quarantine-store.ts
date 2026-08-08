import { randomUUID } from 'node:crypto';

import type { QuarantinedMessage } from './retry-policy.js';

/**
 * Запись упавшего сообщения в карантин (ФТ-I1, Фаза 6 Task 7).
 *
 * ЗАЧЕМ. Очередь `jobs.dead-letter` наполнялась с самого начала, но читать её было
 * некому: ни консьюмера, ни таблицы, ни экрана. Неудавшийся выпуск удостоверения
 * исчезал молча — слушатель ждал документ, которого никто уже не выпустит.
 *
 * Здесь только SQL и никакого AMQP, чтобы поведение можно было проверить тестом
 * с поддельным исполнителем запросов, не поднимая ни очередь, ни базу.
 */

export interface QueryRunner {
  query: (
    sql: string,
    params: unknown[]
  ) => Promise<{ rows?: unknown[]; rowCount?: number | null }>;
}

export interface QuarantineRecord extends QuarantinedMessage {
  queueName: string;
  headers: unknown;
}

/**
 * Кладём сообщение в карантин.
 *
 * Повторное попадание того же `messageId` НЕ создаёт вторую строку: обновляется
 * существующая, счётчик попыток и текст ошибки — свежие, а `status` возвращается в
 * `quarantined`. Иначе список превратился бы в ленту дублей, где не видно, сколько
 * на самом деле застрявших задач.
 *
 * Сообщение без `messageId` (мусор, чужой формат) записывается отдельной строкой —
 * склеивать такие между собой не по чему, а терять их нельзя: именно они и есть
 * самое интересное при разборе.
 */
export async function storeQuarantinedMessage(
  db: QueryRunner,
  record: QuarantineRecord,
  now: () => Date = () => new Date()
): Promise<void> {
  const at = now().toISOString();
  await db.query(
    `insert into documents.job_quarantine (
       id, tenant_id, message_id, job_type, queue_name, routing_key,
       raw_body, payload, headers, retry_count, last_error,
       status, quarantined_at, created_at, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, 'quarantined', $12, $12, $12)
     on conflict (message_id) where message_id is not null
     do update set
       retry_count = excluded.retry_count,
       last_error = excluded.last_error,
       raw_body = excluded.raw_body,
       payload = excluded.payload,
       headers = excluded.headers,
       status = 'quarantined',
       quarantined_at = excluded.quarantined_at,
       resolved_at = null,
       resolved_by = null,
       updated_at = excluded.updated_at`,
    [
      `qtn_${randomUUID()}`,
      record.tenantId,
      record.messageId,
      record.jobType,
      record.queueName,
      record.routingKey,
      record.rawBody,
      record.payload === null || record.payload === undefined
        ? null
        : JSON.stringify(record.payload),
      record.headers === null || record.headers === undefined
        ? null
        : JSON.stringify(record.headers),
      record.retryCount,
      record.lastError,
      at
    ]
  );
}
