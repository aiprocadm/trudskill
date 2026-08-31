import type { GeneratedDocumentEntity } from './documents.types.js';

/**
 * Публичный результат проверки документа по QR (Pillar A Plan C §5.8/§5.9).
 * Намеренно НЕ содержит tenantId и PII — отдаётся неаутентифицированному
 * пользователю/регулятору. Поля learnerFullName/programTitle/issuerName и т.п.
 * остаются опциональными для будущего caller-адаптера, но базовый билдер их не
 * заполняет (см. [[project-pillar-a-regulated-training]]).
 */
export interface PublicVerifyResult {
  status: 'valid' | 'revoked' | 'not_found';
  documentId?: string;
  documentNumber?: string;
  documentType?: string;
  issueDate?: string;
  /** Из source enrollment → mvp.learners. Резолвится caller'ом / адаптером (Plan C MVP — заглушка). */
  learnerFullName?: string;
  /** Из source enrollment → group → course → program meta. Caller adapter. */
  programTitle?: string;
  academicHours?: number;
  /** Краткое имя выдавшей организации (без tenant_id). */
  issuerName?: string;
  /** ФТ-D3.1: бренд выдавшего центра на публичной странице (без tenant_id). */
  issuerLogoUrl?: string;
  issuerBrandColor?: string;
  /** Заполнены только для status='revoked'. */
  revokedAt?: string;
  revocationReason?: string;
  /** Phase 6 — НЭП-подпись. Заполняется ТОЛЬКО для подписанных документов (сигнал доверия на странице проверки). */
  signatureStatus?: 'signed';
  signatureCertificateSubject?: string;
}

/**
 * Чистая проекция выпущенного документа в публичный результат проверки.
 * Источник истины для in-tenant пути (`DocumentsService.verifyDocumentByQrToken`)
 * и кросс-tenant публичного пути (`PublicVerifyController`) — чтобы оба отдавали
 * идентичную форму и одинаково не светили tenantId/PII/actor.
 */
/**
 * ФТ-A6.1: «ФИО показывать частично» — «Иванов Иван Иванович» → «Иванов И. И.».
 *
 * Маска считается ОДИН раз при выпуске документа и хранится в нём готовой:
 * публичный путь намеренно вырезает `variablesSnapshot` (там полные ПДн из
 * бланка), поэтому восстановить ФИО на чтении нечем — да и не нужно.
 * Порядок частей — русская конвенция «Фамилия Имя [Отчество]».
 */
export function maskFullName(fullName: string | undefined): string | undefined {
  const parts = (fullName ?? '').trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return undefined;
  const [surname, ...rest] = parts;
  // Больше трёх частей — хвост отбрасываем: в инициалы идут только имя и отчество,
  // а «Младший»/«оглы» в публичной проверке ничего не подтверждают.
  const initials = rest
    .slice(0, 2)
    .map((part) => `${[...part][0]!.toUpperCase()}.`)
    .join(' ');
  return initials ? `${surname} ${initials}` : surname!;
}

export function buildPublicVerifyResult(doc: GeneratedDocumentEntity): PublicVerifyResult {
  // Административно архивированный (отозванный из обращения) документ НЕ должен публично
  // подтверждаться как подлинный: archive — это «тихое» изъятие, у него нет публичной причины
  // отзыва (в отличие от revoked). Отдаём минимальный not_found, не светя номер/идентификатор
  // изъятого документа — иначе регулятор по QR увидит archived-сертификат как valid.
  if (doc.status === 'archived') {
    return { status: 'not_found' };
  }
  const result: PublicVerifyResult = {
    status: doc.status === 'revoked' ? 'revoked' : 'valid',
    documentId: doc.id,
    documentType: doc.documentType
  };
  if (doc.documentNumber) result.documentNumber = doc.documentNumber;
  if (doc.documentDate) result.issueDate = doc.documentDate;
  // Уже замаскировано на выпуске (ФТ-A6.1) — отдаём как есть.
  if (doc.learnerNamePublic) result.learnerFullName = doc.learnerNamePublic;
  // Программа и часы — то, ради чего страницу и открывают: инспектор проверяет не только
  // подлинность бланка, но и по какой программе и в каком объёме обучен человек.
  if (doc.programTitlePublic) result.programTitle = doc.programTitlePublic;
  if (typeof doc.academicHoursPublic === 'number') result.academicHours = doc.academicHoursPublic;
  if (doc.status === 'revoked') {
    if (doc.revokedAt) result.revokedAt = doc.revokedAt;
    if (doc.revocationReason) result.revocationReason = doc.revocationReason;
  }
  if (doc.signatureStatus === 'signed') {
    result.signatureStatus = 'signed';
    if (doc.signatureCertificateSubject)
      result.signatureCertificateSubject = doc.signatureCertificateSubject;
  }
  return result;
}
