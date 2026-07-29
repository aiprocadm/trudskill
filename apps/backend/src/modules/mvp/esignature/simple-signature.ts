import { createHash } from 'node:crypto';

/**
 * Простая электронная подпись (ФТ-C1.1, Фаза 3 Task 3) — чистая часть.
 *
 * Уровень 1 политики означает: клики «Ознакомлен», ответы на тесты и заявления
 * считаются подписанными ПЭП. Чтобы это имело юридический смысл, нужно доказать, что
 * слушатель принял КОНКРЕТНЫЙ текст соглашения. Отсюда хэш текста, а не ссылка на
 * «соглашение тенанта»: текст редактируется, и через год он будет другим.
 */

/**
 * Хэш текста соглашения.
 *
 * Текст нормализуется перед хэшированием: переводы строк приводятся к `\n`, хвостовые
 * пробелы в строках убираются, крайние пустые строки отбрасываются. Без этого
 * копирование текста из Word (CRLF) породило бы новую версию соглашения и потребовало
 * бы повторного принятия у всех слушателей — при том, что содержание не изменилось.
 */
export function hashAgreementBody(body: string): string {
  const normalized = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export interface AgreementSnapshot {
  version: number;
  bodyHash: string;
}

export interface AcceptanceSnapshot {
  agreementVersion: number;
  bodyHash: string;
}

/**
 * Нужно ли принимать соглашение заново.
 *
 * Сравниваем ХЭШ, а не номер версии: если администратор поправил опечатку и текст
 * содержательно не изменился (после нормализации хэш тот же), гонять всех слушателей
 * по новому кругу незачем. И наоборот — изменённый текст требует нового принятия,
 * даже если номер версии кто-то выставил вручную.
 */
export function needsAcceptance(
  agreement: AgreementSnapshot | null | undefined,
  acceptance: AcceptanceSnapshot | null | undefined
): boolean {
  // Соглашения нет — принимать нечего; ПЭП в этом случае просто не действует.
  if (!agreement) return false;
  if (!acceptance) return true;
  return acceptance.bodyHash !== agreement.bodyHash;
}
