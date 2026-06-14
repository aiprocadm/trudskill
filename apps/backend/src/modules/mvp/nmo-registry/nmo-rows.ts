import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { Enrollment, Learner, NmoRow } from '../mvp.types.js';

export interface NmoDocumentBundle {
  document: Pick<GeneratedDocumentEntity, 'id' | 'documentNumber' | 'documentDate'>;
  enrollment: Enrollment;
  learner: Learner;
  programName: string;
  specialty: string;
  creditUnits?: number;
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildNmoRows(bundles: NmoDocumentBundle[]): NmoRow[] {
  return bundles.map((b) => ({
    documentId: b.document.id,
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    specialty: b.specialty ?? '',
    programName: b.programName ?? '',
    creditUnits: b.creditUnits !== undefined ? String(b.creditUnits) : '',
    completionDate: fmtDate(b.document.documentDate ?? ''),
    documentNumber: b.document.documentNumber ?? ''
  }));
}
