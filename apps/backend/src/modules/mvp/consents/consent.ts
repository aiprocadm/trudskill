import { hashAgreementBody } from '../esignature/simple-signature.js';

/**
 * Раздельные согласия (ФТ-C3.2, Фаза 3 Task 6) — чистая часть.
 *
 * Согласие на обработку персональных данных и согласие на фото — РАЗНЫЕ факты.
 * Объединять их нельзя: отзыв согласия на фото не должен отзывать согласие на
 * обработку данных, и наоборот. Фото лица — зона, граничащая с биометрией, и
 * учебный центр обязан уметь показать проверяющему отдельное согласие на неё.
 */

export const CONSENT_KINDS = ['personal_data', 'photo'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export function isConsentKind(value: unknown): value is ConsentKind {
  return typeof value === 'string' && (CONSENT_KINDS as readonly string[]).includes(value);
}

/** Тот же алгоритм нормализации и хэширования, что у соглашения ПЭП (0067). */
export const hashConsentBody = hashAgreementBody;

/**
 * Проверка согласия на фото, передаваемая в `MvpService` снаружи (как `EffectiveIdentityPolicy`
 * в Task 1): бросает, если согласия нет, и возвращает момент его выдачи для снимка в записи.
 *
 * Почему параметром, а не зависимостью конструктора: `MvpService` создаётся вручную в
 * 75 тестовых файлах, и новая обязательная зависимость превратила бы задачу про согласия
 * в массовую правку тестов.
 */
export type PhotoConsentGate = (
  learnerId: string,
  legacy?: LegacyConsentEvidence
) => Promise<string | undefined>;

/**
 * Доказательство согласия, данного ДО разделения согласий (одна общая галочка).
 *
 * Зачем оно нужно. Миграция `0069` переносит старые согласия SQL-запросом из
 * `learning.identity_verifications`, но эту таблицу код НЕ заполняет: записи
 * идентификации живут в JSONB-снимке состояния (`mvp-collections.ts`). Значит перенос
 * фактически пустой, и слушатель, подавший документы до разделения, окажется «без
 * согласия» — ему закроют повторную подачу, хотя согласие он давал.
 *
 * Настоящий источник правды — сама запись идентификации, поэтому доказательство берётся
 * из неё и передаётся в проверку.
 */
export interface LegacyConsentEvidence {
  /** Историческое поле `consentAt` записи идентификации. */
  consentAt: string;
  /** Фото реально загружено — только тогда историческое согласие покрывает и фото. */
  hasPhoto: boolean;
}

/**
 * Собирает историческое доказательство из записи идентификации.
 *
 * Правило то же, что в SQL-переносе миграции 0069: общая галочка засчитывается как
 * согласие на обработку данных всегда, а как согласие на ФОТО — только если фотография
 * реально загружена. Иначе мы задним числом «получили» согласие, которого человек не
 * давал, — ровно тот дефект, ради устранения которого согласия и разделяют.
 */
export function legacyConsentEvidence(record: {
  consentAt?: string;
  selfieFileId?: string;
  passportFileId?: string;
}): LegacyConsentEvidence | undefined {
  if (!record.consentAt) return undefined;
  return {
    consentAt: record.consentAt,
    hasPhoto: Boolean(record.selfieFileId || record.passportFileId)
  };
}

/** Покрывает ли историческое согласие данный вид. */
export function legacyCovers(kind: ConsentKind, legacy: LegacyConsentEvidence): boolean {
  return kind === 'personal_data' ? true : legacy.hasPhoto;
}

export interface ConsentDocumentSnapshot {
  version: number;
  bodyHash: string;
}

export interface ConsentFactSnapshot {
  grantedAt: string;
  revokedAt?: string | undefined;
  bodyHash?: string | undefined;
}

export interface ConsentState {
  kind: ConsentKind;
  /** Действует ли согласие ПРЯМО СЕЙЧАС — единственное, на что смотрят запреты. */
  granted: boolean;
  grantedAt?: string;
  revokedAt?: string;
  /** Текст согласия был изменён после того, как слушатель его дал. */
  renewalRecommended: boolean;
  documentVersion?: number;
  hasDocument: boolean;
}

/**
 * Состояние согласия по последнему факту и действующему тексту.
 *
 * Изменение текста НЕ снимает уже данное согласие: иначе правка опечатки в тексте
 * мгновенно отозвала бы согласия у всех слушателей центра и остановила бы приём
 * документов. Расхождение показывается флагом `renewalRecommended` — центр сам решает,
 * просить ли переподписать.
 */
export function resolveConsentState(
  kind: ConsentKind,
  document: ConsentDocumentSnapshot | null | undefined,
  fact: ConsentFactSnapshot | null | undefined
): ConsentState {
  const granted = Boolean(fact && !fact.revokedAt);
  return {
    kind,
    granted,
    ...(fact?.grantedAt ? { grantedAt: fact.grantedAt } : {}),
    ...(fact?.revokedAt ? { revokedAt: fact.revokedAt } : {}),
    renewalRecommended: Boolean(
      granted && document && fact?.bodyHash && fact.bodyHash !== document.bodyHash
    ),
    ...(document ? { documentVersion: document.version } : {}),
    hasDocument: Boolean(document)
  };
}
