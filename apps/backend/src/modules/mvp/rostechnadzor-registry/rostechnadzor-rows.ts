import type { Enrollment, Learner, RostechnadzorRow } from '../mvp.types.js';

export interface RostechnadzorBundle {
  enrollment: Enrollment;
  learner: Learner;
  employerName: string;
  employerInn: string;
  attestationArea: string;
  protocol: { documentNumber: string; documentDate: string };
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildRostechnadzorRows(bundles: RostechnadzorBundle[]): RostechnadzorRow[] {
  return bundles.map((b) => ({
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    position: b.learner.position ?? '',
    employerName: b.employerName ?? '',
    employerInn: b.employerInn ?? '',
    attestationArea: b.attestationArea ?? '',
    protocolNumber: b.protocol.documentNumber ?? '',
    knowledgeCheckDate: fmtDate(b.protocol.documentDate ?? ''),
    result: 'удовлетворительно'
  }));
}
