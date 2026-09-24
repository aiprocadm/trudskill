import { IntegrationCryptoService } from '../../modules/integrations/services/integration-crypto.service.js';

/**
 * Шифрование ПДн слушателей at-rest — ФТ-C3.3, Фаза 0 Task 7; расширено 08.09.2026.
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
 * **Что шифруется (расширено 08.09.2026, журнал 375).** Изначально это был один СНИЛС —
 * выбрали самый сильный идентификатор. Но «ФИО + дата рождения» опознаёт человека не хуже,
 * а почта и телефон — это ещё и способ до него дотянуться. Поэтому шифруются четыре поля:
 * СНИЛС, почта, телефон, дата рождения.
 *
 * Имя и фамилия НЕ шифруются сознательно: по ним идут сортировка и поиск в реестре, который
 * открывают десятки раз в день. Зашифровать их значило бы либо расшифровывать весь список на
 * каждый показ, либо завести слепой индекс на каждую букву — цена, несоразмерная выгоде:
 * ФИО без остальных полей мало что даёт тому, кто добрался до дампа базы.
 *
 * Слепой индекс есть только у СНИЛСа: только по нему предполагались SQL-выборки. Остальные
 * поля в SQL не ищутся — состояние центра читается целиком и фильтруется в памяти.
 *
 * Legacy-значения без префикса `enc:` читаются как есть (plaintext passthrough) и
 * перешифровываются при первом же сохранении состояния тенанта (lazy-миграция данных).
 */

const piiCrypto = new IntegrationCryptoService();

const ENC_PREFIX = 'enc:';
const SNILS_BLIND_LABEL = 'pii-snils';
const PASSPORT_BLIND_LABEL = 'pii-passport';

export function isEncryptedPiiValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** Слепой индекс СНИЛС: только цифры (маска «XXX-XXX-XXX YY» и «XXXXXXXXXXX» дают один хэш). */
export function snilsBlindIndex(rawSnils: string): string {
  return piiCrypto.blindIndex(rawSnils.replace(/\D/g, ''), SNILS_BLIND_LABEL);
}

/** Паспорт слушателя (МГ-C1.1): хранится объектом, шифруется целиком одним значением (РМ76). */
export interface LearnerPassport {
  series?: string;
  number?: string;
  issuedAt?: string;
  issuedBy?: string;
}

/** Слепой индекс паспорта — по цифрам серии и номера (поиск дублей при импорте, C3.1). */
export function passportBlindIndex(passport: LearnerPassport | string): string {
  const raw =
    typeof passport === 'string' ? passport : `${passport.series ?? ''}${passport.number ?? ''}`;
  return piiCrypto.blindIndex(raw.replace(/\D/g, ''), PASSPORT_BLIND_LABEL);
}

/** Паспорт → строка для шифрования; объект без единого значения — как пустое поле. */
const passportToPlain = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const clean = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => typeof v === 'string' && v.trim() !== ''
    )
  );
  return Object.keys(clean).length ? JSON.stringify(clean) : '';
};

const passportFromPlain = (value: string): LearnerPassport | string => {
  if (!value.startsWith('{')) return value;
  try {
    return JSON.parse(value) as LearnerPassport;
  } catch {
    // Расшифровалось, но это не JSON: значит, записано строкой до появления объекта — отдаём как есть.
    return value;
  }
};

interface LearnerAtRest {
  snils?: unknown;
  snilsHash?: unknown;
  [key: string]: unknown;
}

/**
 * Поля карточки слушателя, которые шифруются при хранении.
 *
 * Список закрытый и с причиной у каждого поля: «зашифруем всё» невозможно (по имени идёт
 * поиск), а «зашифруем что вспомнилось» — это и есть та дыра, из-за которой почта и телефон
 * пролежали открытыми с Фазы 0 до сентября.
 */
export const ENCRYPTED_LEARNER_FIELDS = [
  'snils', // главный идентификатор человека в госреестрах
  'email', // способ дотянуться до человека; часто совпадает с рабочей почтой
  'phone', // то же и с меньшей защитой на другом конце
  'dateOfBirth', // вместе с ФИО опознаёт человека не хуже СНИЛСа
  'passport' // серия и номер — готовый документ; объект шифруется целиком (МГ-C1.1, РМ76)
] as const;

/** Перед записью в jsonb: ПДн → шифртекст (+ слепой индекс у СНИЛСа). */
export function encryptLearnerPiiAtRest(entity: unknown): unknown {
  const learner = entity as LearnerAtRest | null;
  if (!learner || typeof learner !== 'object') return entity;

  const next: LearnerAtRest = { ...learner };
  let changed = false;
  for (const field of ENCRYPTED_LEARNER_FIELDS) {
    const value = field === 'passport' ? passportToPlain(learner[field]) : learner[field];
    /*
     * Пустые значения не шифруем: шифртекст пустой строки занимает место и ничего не
     * скрывает, а вот отличить «не заполнено» от «зашифровано» после этого сложнее.
     */
    if (typeof value !== 'string' || value === '' || isEncryptedPiiValue(value)) continue;
    next[field] = piiCrypto.encrypt(value);
    if (field === 'snils') next.snilsHash = snilsBlindIndex(value);
    if (field === 'passport') {
      next.passportHash = passportBlindIndex(learner.passport as LearnerPassport | string);
    }
    changed = true;
  }
  return changed ? next : entity;
}

interface GeneratedDocumentAtRest {
  variablesSnapshot?: unknown;
  [key: string]: unknown;
}

/**
 * Снапшот подстановки выданного документа (ФТ-A1.4) шифруется целиком: в нём лежат ровно те
 * значения, что попали в бланк, — ФИО, СНИЛС, даты. Хранится строкой `enc:…` вместо объекта;
 * при чтении разворачивается обратно. Тот же keyring, что у СНИЛСа и TOTP-секретов.
 */
export function encryptDocumentSnapshotAtRest(entity: unknown): unknown {
  const doc = entity as GeneratedDocumentAtRest | null;
  if (!doc || typeof doc !== 'object' || doc.variablesSnapshot == null) {
    return entity;
  }
  if (isEncryptedPiiValue(doc.variablesSnapshot)) {
    return entity;
  }
  return { ...doc, variablesSnapshot: piiCrypto.encrypt(JSON.stringify(doc.variablesSnapshot)) };
}

/** Обратная операция; legacy-plaintext снапшоты (до Task 3) читаются как есть. */
export function decryptDocumentSnapshotAtRest(document: unknown): unknown {
  const doc = document as GeneratedDocumentAtRest | null;
  if (!doc || typeof doc !== 'object' || !isEncryptedPiiValue(doc.variablesSnapshot)) {
    return document;
  }
  try {
    return { ...doc, variablesSnapshot: JSON.parse(piiCrypto.decrypt(doc.variablesSnapshot)) };
  } catch {
    // Ключ провёрнут/шифртекст побит: документ важнее снапшота — отдаём без него,
    // сам документ (файлы, номер, QR) остаётся читаемым.
    const rest = { ...doc };
    delete rest.variablesSnapshot;
    return rest;
  }
}

/**
 * После чтения из jsonb: расшифровать ПДн (или пропустить legacy-plaintext как есть).
 * `snilsHash` — деталь хранения, в память/API не отдаём (при записи посчитается заново).
 *
 * Каждое поле проверяется ОТДЕЛЬНО: у слушателя может быть почта и не быть СНИЛСа, и наоборот.
 * Прежняя редакция выходила по одному лишь незашифрованному СНИЛСу — с четырьмя полями это
 * означало бы, что почта осталась бы шифртекстом и попала бы в таком виде на экран.
 */
export function decryptLearnerPiiAtRest(document: unknown): unknown {
  const learner = document as LearnerAtRest | null;
  if (!learner || typeof learner !== 'object') return document;

  const next: LearnerAtRest = { ...learner };
  let changed = false;
  for (const field of ENCRYPTED_LEARNER_FIELDS) {
    const value = learner[field];
    if (!isEncryptedPiiValue(value)) continue;
    const plain = piiCrypto.decrypt(value);
    next[field] = field === 'passport' ? passportFromPlain(plain) : plain;
    changed = true;
  }
  if ('snilsHash' in next) {
    delete next.snilsHash;
    changed = true;
  }
  if ('passportHash' in next) {
    delete next.passportHash;
    changed = true;
  }
  return changed ? next : document;
}
