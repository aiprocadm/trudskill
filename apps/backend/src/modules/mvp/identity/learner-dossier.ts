/**
 * «Личное дело слушателя» (ФТ-C2, Фаза 3 Task 9) — чистая часть.
 *
 * Дело — это ОДИН документ, который отдают проверяющему: когда и кем подтверждена
 * личность, какие были экзамены (и с какого адреса), какие выданы документы, что
 * человек подписал.
 *
 * **Своей таблицы не заводим.** Всё собирается из существующих источников: копия
 * доказательств неизбежно разошлась бы с оригиналом, а расхождение в доказательной
 * базе хуже, чем её отсутствие.
 *
 * Здесь только преобразования без ввода-вывода — чтобы правила («что считать длительностью
 * сессии», «что показывать, когда данных нет») можно было проверить тестами, не поднимая
 * ни базу, ни Nest.
 */

export interface DossierIdentitySection {
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'none';
  method?: 'selfie_passport' | 'esia';
  submittedAt?: string;
  reviewedAt?: string;
  /** ФИО модератора; для ЕСИА — пометка об автоматическом подтверждении. */
  reviewedBy?: string;
  rejectionReason?: string;
  /** Снимки удалены по сроку хранения — решение при этом осталось. */
  imagesPurgedAt?: string;
}

export interface DossierExamSession {
  attemptId: string;
  testTitle: string;
  startedAt: string;
  finishedAt?: string;
  /** Полные минуты; пусто, если сессия не завершена. */
  durationMinutes?: number;
  score?: number;
  maxScore?: number;
  passed?: boolean;
  /** Из журнала аудита события старта попытки. */
  ip?: string;
  userAgent?: string;
  identityVerifiedAt?: string;
}

export interface DossierDocument {
  id: string;
  documentType: string;
  documentNumber?: string;
  documentDate?: string;
  status: string;
  revokedAt?: string;
}

export interface DossierSignedAction {
  at: string;
  eventType: string;
  description: string;
  /** Чем подписано — из payload журнала. */
  signedWith?: string;
  ip?: string;
}

export interface LearnerDossier {
  learner: {
    id: string;
    fullName: string;
    snils?: string;
    dateOfBirth?: string;
    position?: string;
  };
  identity: DossierIdentitySection;
  exams: DossierExamSession[];
  documents: DossierDocument[];
  signedActions: DossierSignedAction[];
  /**
   * Разделы, которые не удалось прочитать. Пустой раздел и НЕПРОЧИТАННЫЙ раздел —
   * разные вещи: первый значит «ничего не было», второй «мы не знаем». Путать их в
   * доказательном документе недопустимо.
   */
  unavailableSections: string[];
  generatedAt: string;
}

/** Метка модератора: у ЕСИА-подтверждений живого проверяющего не было. */
export const ESIA_REVIEWER_LABEL = 'Подтверждено через Госуслуги (автоматически)';
export const ESIA_ACTOR_ID = 'system_esia';

/**
 * Длительность экзаменационной сессии в полных минутах.
 *
 * Незавершённая сессия длительности не имеет: показывать «0 минут» для брошенной
 * попытки значило бы утверждать, что человек мгновенно закончил. Отрицательная
 * разница (часы сервера разъехались) тоже отбрасывается.
 */
export function examDurationMinutes(
  startedAt: string,
  finishedAt: string | undefined
): number | undefined {
  if (!finishedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return undefined;
  return Math.floor((end - start) / 60000);
}

/** Кто принял решение по идентификации: живой модератор или автоматика ЕСИА. */
export async function resolveReviewerLabel(
  reviewedByActorId: string | undefined,
  userLookup: (actorId: string) => Promise<string | undefined>
): Promise<string | undefined> {
  if (!reviewedByActorId) return undefined;
  if (reviewedByActorId === ESIA_ACTOR_ID) return ESIA_REVIEWER_LABEL;
  // Неизвестный идентификатор показываем как есть: «—» скрыло бы факт, что решение
  // принято, а проверяющему важно видеть, что оно было. Сбой поиска пользователя тоже
  // не должен ронять дело — падаем к идентификатору.
  const name = await userLookup(reviewedByActorId).catch(() => undefined);
  return name ?? reviewedByActorId;
}

/** Из записи журнала — строка «подписанного действия» для дела. */
export function toSignedAction(entry: {
  createdAt: string;
  eventType: string;
  description: string;
  payload: Record<string, unknown>;
}): DossierSignedAction {
  const signedWith = entry.payload['signedWith'];
  const ip = entry.payload['ip'];
  return {
    at: entry.createdAt,
    eventType: entry.eventType,
    description: entry.description,
    ...(typeof signedWith === 'string' ? { signedWith } : {}),
    ...(typeof ip === 'string' ? { ip } : {})
  };
}
