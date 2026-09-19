import type { TenantRequisites } from './tenant.types.js';

/**
 * Настройки идентификации учебного центра (ФТ-C3.1, Фаза 3 Task 7).
 *
 * Живут в `payload` реквизитов тенанта (JSONB) — как настройки нумераторов и картинки
 * документов: это конфигурация одного тенанта, отдельная таблица и миграция ей не нужны.
 *
 * Значения намеренно НЕ обязательные: центр, который ничего не настраивал, обязан
 * работать ровно как раньше. Молчаливая смена поведения при обновлении — худший вид
 * сюрприза, особенно когда речь о сроках удаления персональных данных.
 */

export const TENANT_IDENTITY_SETTINGS_KEY = 'identitySettings';

/** Текущее поведение до появления настройки (152-ФЗ, минимизация данных). */
export const DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS = 90;

/**
 * Границы срока хранения снимков — **решение владельца Р17: от 30 до 365 дней**.
 *
 * **Что было и почему это дрейф (журнал 578).** Границы стояли 1–1095 дней, то есть настройка
 * позволяла и то и другое из двух крайностей, против которых Р17 написан:
 *
 * - **сутки.** Снимок исчезает назавтра после решения модератора. Если слушатель оспорит
 *   отказ — а это первое, что он делает, — показать будет нечего: ни ему, ни проверяющему.
 * - **три года.** Ровно то «вечное хранилище паспортных сканов», которое Р17 называет главным
 *   риском при утечке и прямым нарушением принципа минимизации по 152-ФЗ.
 *
 * **Почему именно 30 и 365.** Месяц — нижняя граница, за которую успевает пройти обычный спор
 * по результату проверки. Год — верхняя: дольше хранить паспортные снимки не нужно ни одной
 * проверке, а риск утечки растёт с каждым месяцем.
 */
export const MIN_IDENTITY_IMAGE_RETENTION_DAYS = 30;
export const MAX_IDENTITY_IMAGE_RETENTION_DAYS = 365;

export interface TenantIdentitySettings {
  /** Через сколько дней после решения модератора удаляются селфи и скан паспорта. */
  imageRetentionDays?: number;
}

/**
 * Разбор `payload.identitySettings` с отбраковкой мусора — payload правит и человек.
 *
 * Мусорное значение (строка, ноль, дробь, отрицательное, запредельное) откатывается к
 * умолчанию МОЛЧА и по одной причине: альтернатива — уронить крон очистки целиком,
 * то есть перестать удалять персональные данные у ВСЕХ тенантов из-за опечатки у одного.
 */
export function readTenantIdentitySettings(requisites?: TenantRequisites): TenantIdentitySettings {
  const raw = requisites?.payload?.[TENANT_IDENTITY_SETTINGS_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const { imageRetentionDays } = raw as { imageRetentionDays?: unknown };
  return isValidRetentionDays(imageRetentionDays) ? { imageRetentionDays } : {};
}

export function isValidRetentionDays(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_IDENTITY_IMAGE_RETENTION_DAYS &&
    value <= MAX_IDENTITY_IMAGE_RETENTION_DAYS
  );
}

/** Действующий срок хранения снимков: настройка тенанта или прежние 90 дней. */
export function identityImageRetentionDays(requisites?: TenantRequisites): number {
  return (
    readTenantIdentitySettings(requisites).imageRetentionDays ??
    DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS
  );
}
