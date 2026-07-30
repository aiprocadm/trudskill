/**
 * Политика идентификации (ФТ-C1, Фаза 3 Task 1).
 *
 * **Зачем.** Три гейта перед итоговым тестом уже существуют (одноразовый код `0044`,
 * селфи+паспорт `0050`, прокторинг `0051`), но включаются флагами на связке группа-курс.
 * Учебный центр не может задать «у нас везде уровень 2»: приходится проставлять галочки
 * на каждой группе, и любая забытая группа — дыра в требовании ТЗ.
 *
 * Здесь — чистое вычисление действующего уровня из трёх записей с разной областью
 * действия. Функция намеренно отделена от БД: решение о допуске к экзамену обязано
 * проверяться тестами без базы и HTTP.
 */

/** Уровни из ТЗ §5. Ниже нуля не бывает: логин с паролем — не опция. */
export const IDENTITY_LEVELS = [0, 1, 2, 3] as const;
export type IdentityLevel = (typeof IDENTITY_LEVELS)[number];

export type IdentityPolicyScope = 'tenant' | 'direction' | 'course';

export interface IdentityPolicyRecord {
  scope: IdentityPolicyScope;
  /** Пусто у политики тенанта. */
  scopeId?: string;
  level: number;
  requirePhotoBeforeExam?: boolean;
  /** ФТ-C1.2: сколько часов подтверждение с фото действительно. Пусто = умолчание. */
  photoMaxAgeHours?: number;
}

export interface EffectiveIdentityPolicy {
  level: IdentityLevel;
  requirePhotoBeforeExam: boolean;
  /** Действующий срок годности подтверждения с фото, в часах. */
  photoMaxAgeHours: number;
  /** Откуда взят уровень — админу нужно понимать, какую запись править. */
  source: IdentityPolicyScope | 'default';
}

/**
 * Приведение уровня к допустимому. Мусор, дробь и выход за 0..3 — уровень 0.
 *
 * Важно: неизвестное значение опускаем до 0, а НЕ поднимаем до 3. Поднять — значит
 * молча запретить экзамен всей группе из-за опечатки в данных; опустить — значит
 * вернуться к базовому логину, что видно и исправимо.
 */
export function normalizeLevel(value: unknown): IdentityLevel {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const rounded = Math.trunc(value);
  if (rounded < 0 || rounded > 3) return 0;
  return rounded as IdentityLevel;
}

/**
 * Действующая политика для курса.
 *
 * Побеждает САМАЯ УЗКАЯ заданная запись: курс важнее направления, направление важнее
 * тенанта. Это не «максимум уровней»: если центр держит уровень 2, а на конкретном
 * ознакомительном курсе поставил 0, то 0 и должен применяться — иначе настройка курса
 * не имела бы смысла.
 *
 * Ничего не задано → уровень 0. Функция НИКОГДА не возвращает «ничего не требуется»:
 * уровень 0 — это логин и пароль, а не отсутствие защиты.
 */
export function resolveIdentityPolicy(
  records: readonly (IdentityPolicyRecord | null | undefined)[]
): EffectiveIdentityPolicy {
  const byScope = (scope: IdentityPolicyScope): IdentityPolicyRecord | undefined =>
    records.find((item): item is IdentityPolicyRecord => Boolean(item) && item!.scope === scope);

  const winner = byScope('course') ?? byScope('direction') ?? byScope('tenant');
  if (!winner) {
    return {
      level: 0,
      requirePhotoBeforeExam: false,
      photoMaxAgeHours: DEFAULT_PHOTO_MAX_AGE_HOURS,
      source: 'default'
    };
  }
  return {
    level: normalizeLevel(winner.level),
    requirePhotoBeforeExam: winner.requirePhotoBeforeExam === true,
    photoMaxAgeHours: normalizePhotoMaxAgeHours(winner.photoMaxAgeHours),
    source: winner.scope
  };
}

/** Требуется ли подтверждение личности документом (уровень 2 и выше). */
export function requiresDocumentIdentity(policy: EffectiveIdentityPolicy): boolean {
  return policy.level >= 2;
}

/** Требуется ли экзаменационный контроль — одноразовый код (уровень 3). */
export function requiresExamControl(policy: EffectiveIdentityPolicy): boolean {
  return policy.level >= 3;
}

/** Требуется ли подписанное соглашение об электронном взаимодействии (уровень 1 и выше). */
export function requiresSimpleSignature(policy: EffectiveIdentityPolicy): boolean {
  return policy.level >= 1;
}

/**
 * Срок годности подтверждения личности с фотографией (ФТ-C1.2).
 *
 * **Ответ владельца от 2026-07-29** на вопрос «что значит „непосредственно перед
 * экзаменом“»: 24 часа, снимок ОДИН на слушателя (не на каждую попытку), срок
 * настраивается администратором.
 *
 * Почему не «навсегда»: подтверждение, сделанное полгода назад, ничего не говорит о том,
 * кто сидит за компьютером сегодня. Почему не «15 минут»: человека пришлось бы
 * фотографировать перед каждой попыткой, а модератор проверяет заявки не мгновенно —
 * слушатель просто не успел бы к экзамену.
 */
export const DEFAULT_PHOTO_MAX_AGE_HOURS = 24;
export const MIN_PHOTO_MAX_AGE_HOURS = 1;
export const MAX_PHOTO_MAX_AGE_HOURS = 720;

/**
 * Приведение срока к допустимому. Мусор и выход за границы — умолчание.
 *
 * Как и с уровнем политики: опечатка в настройке не должна ни запереть экзамен всей
 * группе, ни молча отменить требование свежести. Умолчание — предсказуемая середина.
 */
export function normalizePhotoMaxAgeHours(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_PHOTO_MAX_AGE_HOURS ||
    value > MAX_PHOTO_MAX_AGE_HOURS
  ) {
    return DEFAULT_PHOTO_MAX_AGE_HOURS;
  }
  return value;
}

/**
 * Свежо ли подтверждение на момент `now`.
 *
 * Отсчёт ведётся от момента РЕШЕНИЯ МОДЕРАТОРА (`reviewedAt`), а не от подачи: пока
 * заявку не проверили, подтверждения ещё нет. Если решения нет — считать нечего.
 */
export function isPhotoVerificationFresh(
  reviewedAt: string | undefined,
  maxAgeHours: number,
  now: Date = new Date()
): boolean {
  if (!reviewedAt) return false;
  const reviewed = new Date(reviewedAt);
  if (Number.isNaN(reviewed.getTime())) return false;
  const ageMs = now.getTime() - reviewed.getTime();
  // Отрицательный возраст (часы сервера разъехались) считаем свежим: запирать человека
  // из-за рассинхронизации часов хуже, чем пропустить.
  if (ageMs < 0) return true;
  return ageMs <= maxAgeHours * 3600_000;
}
