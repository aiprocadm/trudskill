import { isValidSnilsChecksum, normalizeSnils } from './snils.util.js';

import type { CommissionMember } from './mvp.types.js';

/**
 * Готовность к проведению экзамена (ФТ-E3.2, Фаза 3 Task 10).
 *
 * Проверки идут ДО старта, а не после: протокол, подписанный комиссией из двух человек,
 * или удостоверение без СНИЛС — это брак, который вскрывается у проверяющего через
 * месяцы, когда пересдавать уже поздно. Дешевле не пустить, чем переделывать.
 *
 * Здесь только чистые правила без ввода-вывода — их проверяют тестами, не поднимая Nest.
 */

/**
 * Минимальный состав аттестационной комиссии.
 *
 * Три человека — не произвольное число: комиссия должна уметь принять решение
 * большинством, а двое большинства не образуют. Это же требование стоит в ТЗ.
 */
export const MIN_COMMISSION_MEMBERS = 3;

export interface ExamReadinessIssue {
  /** Что мешает: `commission`, `learner`, `program`. */
  scope: 'commission' | 'learner' | 'program';
  /** Кого/чего касается — идентификатор для показа и поиска. */
  subjectId?: string;
  subjectName?: string;
  code: string;
  message: string;
}

export interface ExamReadinessReport {
  ready: boolean;
  issues: ExamReadinessIssue[];
}

/** Отображаемое имя члена комиссии: внутренний пользователь или внешний эксперт. */
export function commissionMemberName(member: CommissionMember): string {
  return member.externalFullName?.trim() || member.userId || member.id;
}

/**
 * Проверка состава комиссии.
 *
 * Помимо количества требуется председатель: протокол подписывает именно он, и
 * комиссия без председателя не может закрыть группу — это выяснится в самый неудобный
 * момент, при печати документов.
 */
export function checkCommission(members: readonly CommissionMember[]): ExamReadinessIssue[] {
  const issues: ExamReadinessIssue[] = [];

  if (members.length < MIN_COMMISSION_MEMBERS) {
    issues.push({
      scope: 'commission',
      code: 'commission_too_small',
      message: `В комиссии ${members.length} чел., требуется не менее ${MIN_COMMISSION_MEMBERS}: решение принимается большинством`
    });
  }

  if (!members.some((m) => m.role === 'chairman')) {
    issues.push({
      scope: 'commission',
      code: 'commission_chairman_missing',
      message: 'В комиссии нет председателя — протокол некому подписать'
    });
  }

  // Член комиссии без имени попадёт в протокол пустой строкой. Такой документ
  // недействителен, а обнаружится это уже после печати.
  for (const member of members) {
    if (!member.externalFullName?.trim() && !member.userId) {
      issues.push({
        scope: 'commission',
        subjectId: member.id,
        code: 'commission_member_unnamed',
        message: 'У члена комиссии не указано ни ФИО, ни пользователь системы'
      });
    }
  }

  return issues;
}

export interface ExamLearnerCandidate {
  id: string;
  fullName: string;
  snils?: string;
}

/**
 * Проверка данных слушателей — то же правило, что и в проверке готовности выгрузки
 * (ФТ-C4.1, Task 8): без СНИЛС запись в реестре не опознаётся.
 *
 * Проверяем ДО экзамена, а не перед выгрузкой, потому что после экзамена исправлять
 * поздно: протокол уже подписан, а переподписывать его из-за опечатки в СНИЛС —
 * отдельная процедура.
 */
export function checkLearners(learners: readonly ExamLearnerCandidate[]): ExamReadinessIssue[] {
  const issues: ExamReadinessIssue[] = [];

  for (const learner of learners) {
    if (!learner.snils?.trim()) {
      issues.push({
        scope: 'learner',
        subjectId: learner.id,
        subjectName: learner.fullName,
        code: 'learner_snils_missing',
        message: 'Не заполнен СНИЛС — запись в реестре не будет принята'
      });
      continue;
    }
    const digits = normalizeSnils(learner.snils);
    if (digits.length !== 11 || !isValidSnilsChecksum(digits)) {
      issues.push({
        scope: 'learner',
        subjectId: learner.id,
        subjectName: learner.fullName,
        code: 'learner_snils_invalid',
        message: 'СНИЛС не проходит проверку контрольной суммы — вероятна опечатка'
      });
    }
  }

  return issues;
}

/** Сводная готовность: экзамен можно проводить, только когда список пуст. */
export function buildExamReadiness(
  members: readonly CommissionMember[],
  learners: readonly ExamLearnerCandidate[]
): ExamReadinessReport {
  const issues = [...checkCommission(members), ...checkLearners(learners)];
  return { ready: issues.length === 0, issues };
}
