import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { Enrollment, Learner, OtRegistryRow, OtTrainingProgram } from '../mvp.types.js';

export interface EnrollmentBundle {
  enrollment: Enrollment;
  learner: Learner;
  employerInn: string;
  protocol: Pick<GeneratedDocumentEntity, 'documentNumber' | 'documentDate'>;
  examPassed: boolean;
  programs: OtTrainingProgram[];
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildRegistryRows(bundles: EnrollmentBundle[]): OtRegistryRow[] {
  const rows: OtRegistryRow[] = [];
  for (const b of bundles) {
    for (const p of b.programs) {
      rows.push({
        enrollmentId: b.enrollment.id,
        learnerId: b.learner.id,
        fullName: fullName(b.learner),
        snils: b.learner.snils ?? '',
        position: b.learner.position ?? '',
        employerInn: b.employerInn ?? '',
        programCode: p.code,
        programRegistryId: p.registryId,
        programName: p.exactName,
        protocolNumber: b.protocol.documentNumber ?? '',
        knowledgeCheckDate: fmtDate(b.protocol.documentDate ?? ''),
        result: b.examPassed ? 'удовлетворительно' : 'неудовлетворительно'
      });
    }
  }
  return rows;
}
