import { IntegrationCryptoService } from '../../modules/integrations/services/integration-crypto.service.js';

/**
 * Шифрование ПДн слушателей at-rest — ФТ-C3.3, Фаза 0 Task 7.
 *
 * Learners хранятся в Postgres целыми JSONB-документами (learning.mvp_runtime_documents
 * и stage1-зеркало), поэтому шифрование живёт на границе персистенса: при записи СНИЛС
 * шифруется (AES-256-GCM, тот же keyring, что у секретов интеграций и TOTP), при чтении
 * расшифровывается — весь рантайм (реестры, ЕСИА-сверка, PDF-карточка, отчёты) продолжает
 * работать с открытым значением в памяти и не меняется.
 *
 * Рядом с шифртекстом кладётся слепой индекс `snilsHash` (keyed HMAC по НОРМАЛИЗОВАННЫМ
 * цифрам) — для будущих SQL-выборок/уникальности без расшифровки (индекс — миграция 0061).
 *
 * Legacy-значения без префикса `enc:` читаются как есть (plaintext passthrough) и
 * перешифровываются при первом же сохранении состояния тенанта (lazy-миграция данных).
 */

const piiCrypto = new IntegrationCryptoService();

const ENC_PREFIX = 'enc:';
const SNILS_BLIND_LABEL = 'pii-snils';

export function isEncryptedPiiValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** Слепой индекс СНИЛС: только цифры (маска «XXX-XXX-XXX YY» и «XXXXXXXXXXX» дают один хэш). */
export function snilsBlindIndex(rawSnils: string): string {
  return piiCrypto.blindIndex(rawSnils.replace(/\D/g, ''), SNILS_BLIND_LABEL);
}

interface LearnerAtRest {
  snils?: unknown;
  snilsHash?: unknown;
  [key: string]: unknown;
}

/** Перед записью в jsonb: снилс → шифртекст + слепой индекс. Прочие поля не трогаем. */
export function encryptLearnerPiiAtRest(entity: unknown): unknown {
  const learner = entity as LearnerAtRest | null;
  if (!learner || typeof learner !== 'object' || typeof learner.snils !== 'string') {
    return entity;
  }
  if (isEncryptedPiiValue(learner.snils)) {
    return entity;
  }
  return {
    ...learner,
    snils: piiCrypto.encrypt(learner.snils),
    snilsHash: snilsBlindIndex(learner.snils)
  };
}

/**
 * После чтения из jsonb: расшифровать снилс (или пропустить legacy-plaintext как есть).
 * `snilsHash` — деталь хранения, в память/API не отдаём (при записи посчитается заново).
 */
export function decryptLearnerPiiAtRest(document: unknown): unknown {
  const learner = document as LearnerAtRest | null;
  if (!learner || typeof learner !== 'object' || !isEncryptedPiiValue(learner.snils)) {
    return document;
  }
  const rest = { ...learner };
  delete rest.snilsHash;
  return { ...rest, snils: piiCrypto.decrypt(learner.snils) };
}
