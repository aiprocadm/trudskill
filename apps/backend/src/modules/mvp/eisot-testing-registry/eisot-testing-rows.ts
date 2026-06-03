import type { EisotTestingRow, Enrollment, Learner } from '../mvp.types.js';

export interface EisotTestingBundle {
  enrollment: Enrollment;
  learner: Learner;
  employerName: string;
  employerInn: string;
  programName: string;
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildEisotTestingRows(bundles: EisotTestingBundle[]): EisotTestingRow[] {
  return bundles.map((b) => ({
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    dateOfBirth: b.learner.dateOfBirth ? fmtDate(b.learner.dateOfBirth) : '',
    position: b.learner.position ?? '',
    employerName: b.employerName ?? '',
    employerInn: b.employerInn ?? '',
    programName: b.programName ?? '',
    referralDate: b.enrollment.enrolledAt ? fmtDate(b.enrollment.enrolledAt) : ''
  }));
}
