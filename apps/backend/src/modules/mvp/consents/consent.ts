/**
 * Раздельные согласия на ПДн и на фото (ФТ-C3.2, Фаза 3 Task 6) — чистая часть.
 *
 * Почему согласий два. Фотография лица — почти биометрия: человек вправе сказать
 * «данные обрабатывайте, но снимать меня не надо». Одна общая галочка такого выбора
 * не даёт, а значит согласие на фото по существу не получено.
 */

export type ConsentKind = 'pii' | 'photo';

export const CONSENT_KINDS: readonly ConsentKind[] = ['pii', 'photo'] as const;

/** Отметки согласия на записи идентификации. */
export interface ConsentFacts {
  /** Согласие на обработку ПДн (152-ФЗ). */
  piiConsentAt?: string;
  piiConsentRevokedAt?: string;
  /** Отдельное согласие на фото/изображение лица. */
  photoConsentAt?: string;
  photoConsentRevokedAt?: string;
  /** Историческое поле: одна общая галочка до разделения согласий. */
  consentAt?: string;
}

export interface ResolvedConsent {
  granted: boolean;
  at?: string;
  revokedAt?: string;
  /** Согласие восстановлено из исторической записи, а не дано явно после разделения. */
  legacy: boolean;
}

export interface ResolvedConsents {
  pii: ResolvedConsent;
  photo: ResolvedConsent;
}

/**
 * Разбирает согласия записи, включая исторические.
 *
 * **Перенос старых записей — самое тонкое место задачи.** До разделения существовала одна
 * галочка «согласие на обработку персональных данных». Её честно считаем согласием на ПДн.
 *
 * А вот согласие на ФОТО у старых записей засчитываем ТОЛЬКО тем, кто фотографию реально
 * загрузил. Иначе мы задним числом «получили» согласие, которого человек не давал — а это
 * ровно тот дефект, ради устранения которого согласия и разделяют. Тот, кто поставил общую
 * галочку, но фото не приложил, остаётся без согласия на фото и будет спрошен явно.
 *
 * Переноса в SQL нет намеренно: записи идентификации живут в JSONB-снимке состояния, а
 * таблица `learning.identity_verifications` (0050) кодом не заполняется — миграция данных
 * в ней была бы пустой и вводила бы в заблуждение.
 */
export function resolveConsents(
  record: ConsentFacts & { selfieFileId?: string; passportFileId?: string }
): ResolvedConsents {
  const hasPhoto = Boolean(record.selfieFileId || record.passportFileId);

  const pii = resolveOne(record.piiConsentAt, record.piiConsentRevokedAt, record.consentAt);
  const photo = resolveOne(
    record.photoConsentAt,
    record.photoConsentRevokedAt,
    hasPhoto ? record.consentAt : undefined
  );

  return { pii, photo };
}

function resolveOne(
  explicitAt: string | undefined,
  revokedAt: string | undefined,
  legacyAt: string | undefined
): ResolvedConsent {
  const at = explicitAt ?? legacyAt;
  if (!at) return { granted: false, legacy: false };

  // Отзыв учитывается, только если он позже согласия: повторное согласие после отзыва
  // должно работать, иначе человек, передумавший дважды, окажется заперт навсегда.
  const revoked = revokedAt !== undefined && revokedAt >= at;
  return {
    granted: !revoked,
    at,
    ...(revoked ? { revokedAt } : {}),
    legacy: explicitAt === undefined
  };
}

/** Можно ли принимать фото: без согласия на фото загрузка недопустима. */
export function mayUploadIdentityImages(consents: ResolvedConsents): boolean {
  return consents.pii.granted && consents.photo.granted;
}

/**
 * Доступен ли слушателю уровень 2 (подтверждение личности с фото).
 *
 * Отказ от фото — это законный выбор, и человеку надо сказать о последствиях ПРЯМО,
 * а не молча не пустить его на экзамен.
 */
export function identityLevelTwoAvailable(consents: ResolvedConsents): boolean {
  return mayUploadIdentityImages(consents);
}
