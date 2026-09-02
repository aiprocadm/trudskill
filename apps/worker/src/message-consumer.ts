/**
 * Decision core for the RabbitMQ consumer loop, extracted from `main.ts` so the
 * dedup / processing ordering is unit-testable without a real broker or Postgres
 * (mirrors the `document-pipeline.ts` extraction pattern).
 *
 * Ordering contract (at-least-once, idempotent consumer):
 *   1. Skip if the message was already processed successfully (redelivery after a
 *      crash that happened between processing and ack).
 *   2. Run the job.
 *   3. Record the dedup mark ONLY after the job succeeds.
 *
 * Recording the mark *before* processing (the previous behaviour) silently drops
 * every job that fails transiently on its first attempt: the retry is republished
 * with the same `messageId`, finds the dedup row already present, and is skipped.
 * Marking after success means a transient failure leaves no dedup row, so the
 * retry re-runs. The downstream bulk-enrollment callback is idempotent (it carries
 * its own `idempotencyKey`), so a reprocess in the narrow crash window between
 * success and mark is safe.
 */

/**
 * Типы заданий, которые кто-то публикует. `integration` и `notification` убраны 02.09.2026
 * (журнал 328): их не публиковал никто, а обрабатывались они ПУСТЫМ `return` — воркер
 * принимал задание, не делал ничего и помечал выполненным, а метка защиты от повторов
 * не давала повторить. Пустой обработчик хуже отсутствующего: отсутствующий падает на
 * `default` («Unknown job type»), задание уходит в повтор и дальше в карантин, то есть
 * остаётся ВИДИМЫМ. Вернутся вместе со своими публикациями и настоящей обработкой.
 */
export type WorkerJobType = 'document' | 'bulk_enrollment';

export interface WorkerEnvelope {
  messageId: string;
  tenantId: string;
  jobType: WorkerJobType;
  payload: Record<string, unknown>;
}

export type ConsumeOutcome =
  | { kind: 'skipped_duplicate' }
  | { kind: 'processed' }
  | { kind: 'failed'; error: unknown };

export interface MessageConsumerDeps {
  hasBeenProcessed: (messageId: string) => Promise<boolean>;
  markProcessed: (messageId: string) => Promise<void>;
  processJob: (envelope: WorkerEnvelope) => Promise<void>;
}

export async function consumeMessage(
  envelope: WorkerEnvelope,
  deps: MessageConsumerDeps
): Promise<ConsumeOutcome> {
  if (await deps.hasBeenProcessed(envelope.messageId)) {
    return { kind: 'skipped_duplicate' };
  }

  try {
    await deps.processJob(envelope);
  } catch (error) {
    return { kind: 'failed', error };
  }

  await deps.markProcessed(envelope.messageId);
  return { kind: 'processed' };
}
