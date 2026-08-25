import type { PortalDocument } from '../mvp/types';

/**
 * `ФТ-H2` · что требует внимания заказчику обучения.
 *
 * Портал заказчика был оглавлением из трёх списков: сотрудники, группы, документы. На
 * вопрос «что мне делать» он не отвечал — представитель компании должен был сам
 * просматривать выданные документы и сверять сроки.
 *
 * А вопрос у него ровно один и денежный: **у кого из моих людей заканчивается
 * удостоверение**. Сотрудник с истёкшим документом не допускается к работе, и узнать об
 * этом лучше заранее, чем в день проверки.
 *
 * Окна взяты те же, что у переаттестации внутри центра (ФТ-D-переобучение): 60 дней —
 * пора планировать, 30 — пора записывать, 7 — уже горит. Одинаковые окна значат, что
 * заказчик и учебный центр видят одну и ту же картину и не спорят о сроках.
 */

export type ExpiryUrgency = 'expired' | 'critical' | 'soon' | 'ok';

export interface DocumentExpiry {
  document: PortalDocument;
  /** Сколько дней осталось; отрицательное — уже просрочен. */
  daysLeft: number;
  urgency: ExpiryUrgency;
}

/** Подписи срочности. «Просрочено» — не «expired»: человек читает слова, а не коды. */
export const URGENCY_LABEL: Record<ExpiryUrgency, string> = {
  expired: 'Просрочено',
  critical: 'Истекает на этой неделе',
  soon: 'Истекает в течение месяца',
  ok: 'Действует'
};

const DAY_MS = 24 * 60 * 60 * 1000;

const urgencyOf = (daysLeft: number): ExpiryUrgency => {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'critical';
  if (daysLeft <= 60) return 'soon';
  return 'ok';
};

/**
 * Сроки по выданным документам.
 *
 * Документы без срока (`validUntil` пуст) пропускаются: бессрочная справка сроком не
 * истекает, и показывать её в очереди «требует внимания» значит зашумлять список тем,
 * с чем ничего делать не надо.
 *
 * `now` передаётся снаружи — иначе тест зависел бы от календаря машины.
 */
export const documentExpiries = (documents: PortalDocument[], now: Date): DocumentExpiry[] =>
  documents
    .filter((document) => Boolean(document.validUntil))
    .map((document) => {
      const until = new Date(document.validUntil as string).getTime();
      const daysLeft = Math.floor((until - now.getTime()) / DAY_MS);
      return { document, daysLeft, urgency: urgencyOf(daysLeft) };
    })
    // Сначала то, что горит. Очередь, а не оглавление: человеку нужен порядок действий.
    .sort((a, b) => a.daysLeft - b.daysLeft);

/** Сколько документов в каждом состоянии — для плиток над очередью. */
export const expirySummary = (
  expiries: DocumentExpiry[]
): { expired: number; critical: number; soon: number } => ({
  expired: expiries.filter((item) => item.urgency === 'expired').length,
  critical: expiries.filter((item) => item.urgency === 'critical').length,
  soon: expiries.filter((item) => item.urgency === 'soon').length
});

/** Очередь внимания: только то, с чем нужно что-то делать. */
export const needsAttention = (expiries: DocumentExpiry[]): DocumentExpiry[] =>
  expiries.filter((item) => item.urgency !== 'ok');
