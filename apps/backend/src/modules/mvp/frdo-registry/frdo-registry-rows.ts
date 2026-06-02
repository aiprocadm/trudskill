import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { Enrollment, FrdoDocumentKind, FrdoRegistryRow, Learner } from '../mvp.types.js';

export interface FrdoDocumentBundle {
  document: Pick<
    GeneratedDocumentEntity,
    'id' | 'documentNumber' | 'documentDate' | 'documentType'
  >;
  enrollment: Enrollment;
  learner: Learner;
  kind: FrdoDocumentKind;
  programName: string;
  academicHours?: number;
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildFrdoRows(bundles: FrdoDocumentBundle[]): FrdoRegistryRow[] {
  return bundles.map((b) => ({
    documentId: b.document.id,
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    documentKindCode: b.kind.code,
    documentKind: b.kind.exactName,
    registrationNumber: b.document.documentNumber ?? '',
    issueDate: fmtDate(b.document.documentDate ?? ''),
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    dateOfBirth: b.learner.dateOfBirth ? fmtDate(b.learner.dateOfBirth) : '',
    programName: b.programName ?? '',
    academicHours: b.academicHours !== undefined ? String(b.academicHours) : '',
    qualification: ''
  }));
}
