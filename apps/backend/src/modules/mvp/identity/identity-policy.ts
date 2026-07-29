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
}

export interface EffectiveIdentityPolicy {
  level: IdentityLevel;
  requirePhotoBeforeExam: boolean;
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
    return { level: 0, requirePhotoBeforeExam: false, source: 'default' };
  }
  return {
    level: normalizeLevel(winner.level),
    requirePhotoBeforeExam: winner.requirePhotoBeforeExam === true,
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
