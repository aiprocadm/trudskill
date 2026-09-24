import type { ExamReadinessIssue } from '../exam-readiness.js';
import type { EnrollmentResultCode } from '../mvp.types.js';

/**
 * «Что мешает выпустить документы» группы — одним ответом (ТЗ перехода с CDOPROF, МГ-F5.1,
 * Фаза 3, срез 20.1).
 *
 * Раньше проверки жили в трёх местах и в трёх ручках: центр (`IssuanceReadinessService`,
 * только при выпуске), экзамен (`exam-readiness`, комиссия и СНИЛС — экран её не вызывал) и
 * цепочка закрытия (результат экзамена, поимённо — только в отчёте после попытки). Человек
 * узнавал о проблеме, нажав «Выпустить» и получив отказ. Здесь все три уровня собраны заранее,
 * а слушательские проверки дополнены тем, что ТЗ называет прямо: дата рождения (Р12 —
 * обязательна для выгрузки), должность, результат аттестации, согласие на ПДн (настройкой).
 *
 * Чистые функции без ввода-вывода: данные собирает `MvpService.issueReadinessFacts`,
 * согласия и настройки — `IssueReadinessService`.
 */

export interface IssueReadinessItem {
  code: string;
  message: string;
}

export interface LearnerReadiness {
  learnerId: string;
  learnerName: string;
  issues: IssueReadinessItem[];
}

export interface IssueReadinessReport {
  ready: boolean;
  /** Центр: реквизиты, лицензия, комиссия, бланк, нумерация. */
  center: IssueReadinessItem[];
  /** Группа и программа: курсы, комиссия курса. */
  group: IssueReadinessItem[];
  /** Слушатели с проблемами — поимённо (принцип частичного успеха). */
  learners: LearnerReadiness[];
  totals: { learners: number; learnersReady: number };
  /** Проверялось ли согласие на ПДн (настройка центра «требовать согласие перед выпуском»). */
  consentRequired: boolean;
}

export interface IssueReadinessLearnerFacts {
  id: string;
  fullName: string;
  dateOfBirth?: string | undefined;
  position?: string | undefined;
  resultCode?: EnrollmentResultCode | undefined;
  /** Действующее согласие на ПДн; `undefined` — не проверялось (настройка выключена). */
  consent?: boolean | undefined;
}

export interface IssueReadinessInput {
  center: IssueReadinessItem[];
  groupIssues: IssueReadinessItem[];
  examIssues: readonly ExamReadinessIssue[];
  learners: readonly IssueReadinessLearnerFacts[];
  requireConsent: boolean;
}

/** Ключ настройки центра: `org.tenant_settings.payload.documents.requireConsentBeforeIssue`. */
export const DOCUMENTS_SETTINGS_KEY = 'documents';

/**
 * «Требовать согласие на ПДн перед выпуском» — по умолчанию ВЫКЛЮЧЕНО (РМ124): ТЗ оставило
 * решение владельцу, а включённая по умолчанию проверка остановила бы выпуск у центров, где
 * согласия собраны на бумаге и ещё не внесены. Непонятное значение — значение по умолчанию.
 */
export const requireConsentBeforeIssueFrom = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false;
  const documents = (payload as Record<string, unknown>)[DOCUMENTS_SETTINGS_KEY];
  if (!documents || typeof documents !== 'object') return false;
  return (documents as Record<string, unknown>).requireConsentBeforeIssue === true;
};

const RESULT_ISSUE: Record<'missing' | 'failed' | 'absent', IssueReadinessItem> = {
  missing: {
    code: 'exam_result_missing',
    message: 'Нет результата итоговой аттестации — документ об обучении выдаётся после неё'
  },
  failed: {
    code: 'exam_not_passed',
    message: 'Аттестация не сдана — документ об успешном обучении не выдаётся'
  },
  absent: {
    code: 'exam_not_passed',
    message: 'Не явился на аттестацию — документ об успешном обучении не выдаётся'
  }
};

/** Проверки одного слушателя, кроме СНИЛС (его проверяет готовность экзамена). */
export function learnerIssues(
  learner: IssueReadinessLearnerFacts,
  requireConsent: boolean
): IssueReadinessItem[] {
  const issues: IssueReadinessItem[] = [];
  if (!learner.dateOfBirth?.trim()) {
    issues.push({
      code: 'learner_birth_date_missing',
      message: 'Не указана дата рождения — без неё удостоверение не примут в реестр'
    });
  }
  if (!learner.position?.trim()) {
    issues.push({
      code: 'learner_position_missing',
      message: 'Не указана должность — она печатается в протоколе и удостоверении'
    });
  }
  if (learner.resultCode !== 'passed') {
    issues.push(RESULT_ISSUE[learner.resultCode ?? 'missing']);
  }
  if (requireConsent && learner.consent !== true) {
    issues.push({
      code: 'learner_consent_missing',
      message: 'Нет согласия на обработку персональных данных — центр требует его до выпуска'
    });
  }
  return issues;
}

export function buildIssueReadiness(input: IssueReadinessInput): IssueReadinessReport {
  const group: IssueReadinessItem[] = [...input.groupIssues];
  const seenGroup = new Set(group.map((item) => `${item.code}:${item.message}`));
  const learnerExam = new Map<string, IssueReadinessItem[]>();
  const seenLearner = new Set<string>();
  for (const issue of input.examIssues) {
    if (issue.scope === 'learner' && issue.subjectId) {
      // Один и тот же СНИЛС проверяется по каждому курсу группы — показываем один раз.
      const key = `${issue.subjectId}:${issue.code}`;
      if (seenLearner.has(key)) continue;
      seenLearner.add(key);
      const list = learnerExam.get(issue.subjectId) ?? [];
      list.push({ code: issue.code, message: issue.message });
      learnerExam.set(issue.subjectId, list);
      continue;
    }
    const key = `${issue.code}:${issue.message}`;
    if (seenGroup.has(key)) continue;
    seenGroup.add(key);
    group.push({ code: issue.code, message: issue.message });
  }

  const learners: LearnerReadiness[] = [];
  for (const learner of input.learners) {
    const issues = [
      ...(learnerExam.get(learner.id) ?? []),
      ...learnerIssues(learner, input.requireConsent)
    ];
    if (issues.length > 0) {
      learners.push({ learnerId: learner.id, learnerName: learner.fullName, issues });
    }
  }
  learners.sort((a, b) => a.learnerName.localeCompare(b.learnerName, 'ru'));

  return {
    ready: input.center.length === 0 && group.length === 0 && learners.length === 0,
    center: input.center,
    group,
    learners,
    totals: {
      learners: input.learners.length,
      learnersReady: input.learners.length - learners.length
    },
    consentRequired: input.requireConsent
  };
}
