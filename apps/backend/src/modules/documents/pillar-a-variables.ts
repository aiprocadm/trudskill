/**
 * Resolver для категорий переменных `program.*` и `commission.*` (Plan A §5.5).
 *
 * Контракт: pure-function. Caller (background worker / task processor) собирает
 * данные из MVP state (`course_versions`, `commissions`, `commission_members`,
 * `lookup.regulatory_acts`) и передаёт сюда снимки. Resolver возвращает плоский
 * словарь `{ 'program.academic_hours': 40, 'program.training_type_label': '...' }`.
 *
 * Почему pure functions, а не methods на DocumentsService с MvpAdapter port:
 * - codebase pattern: `resolveTemplateVariables` тоже не лезет в чужие state'ы,
 *   payload passed in.
 * - избегаем module-level циклической зависимости documents ↔ mvp.
 * - легко тестируется без DI.
 */
import type { GeneratedDocumentEntity } from './documents.types.js';
import type {
  Commission,
  CommissionMember,
  CourseVersion,
  Enrollment,
  Learner,
  RegulatoryAct
} from '../mvp/mvp.types.js';

/** Русские лейблы для регулируемых enum'ов (Plan A §5.1). */
export const TRAINING_TYPE_LABELS = {
  primary: 'Первичное обучение',
  repeat: 'Повторное обучение',
  target: 'Целевое обучение',
  extraordinary: 'Внеочередное обучение'
} as const;

export const LEARNER_CATEGORY_LABELS = {
  worker: 'Рабочие',
  specialist: 'Специалисты',
  manager: 'Руководители',
  mixed: 'Смешанная категория'
} as const;

export const STUDY_FORM_LABELS = {
  in_person: 'Очная',
  distance: 'Дистанционная',
  blended: 'Смешанная'
} as const;

export const FINAL_ASSESSMENT_FORM_LABELS = {
  test: 'Тестирование',
  exam: 'Экзамен',
  defense: 'Защита проекта',
  interview: 'Собеседование'
} as const;

export interface ProgramVariableContext {
  courseVersion: CourseVersion;
  regulatoryActs: RegulatoryAct[];
  /** Опциональная привязанная комиссия — для `{program.commission_*}` подвыборки. */
  commission?: Commission;
}

/**
 * Разрешает запрошенные переменные категории `program.*`. Неизвестные ключи
 * возвращаются как пустая строка (consistent с шаблонным engine pattern).
 */
export function resolveProgramVariables(
  ctx: ProgramVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const { courseVersion: cv, regulatoryActs, commission } = ctx;
  const result: Record<string, unknown> = {};

  for (const fullName of varNames) {
    if (!fullName.startsWith('program.')) {
      result[fullName] = '';
      continue;
    }
    const key = fullName.slice('program.'.length);
    result[fullName] = resolveProgramKey(key, cv, regulatoryActs, commission);
  }
  return result;
}

function resolveProgramKey(
  key: string,
  cv: CourseVersion,
  acts: RegulatoryAct[],
  commission: Commission | undefined
): unknown {
  switch (key) {
    case 'academic_hours':
      return cv.academicHours ?? '';
    case 'training_type':
      return cv.trainingType ?? '';
    case 'training_type_label':
      return cv.trainingType ? TRAINING_TYPE_LABELS[cv.trainingType] : '';
    case 'learner_category':
      return cv.learnerCategory ?? '';
    case 'learner_category_label':
      return cv.learnerCategory ? LEARNER_CATEGORY_LABELS[cv.learnerCategory] : '';
    case 'study_form':
      return cv.studyForm ?? '';
    case 'study_form_label':
      return cv.studyForm ? STUDY_FORM_LABELS[cv.studyForm] : '';
    case 'final_assessment_form':
      return cv.finalAssessmentForm ?? '';
    case 'final_assessment_form_label':
      return cv.finalAssessmentForm ? FINAL_ASSESSMENT_FORM_LABELS[cv.finalAssessmentForm] : '';
    case 'regulatory_basis':
      // CSV из short_name актов в порядке, в котором они указаны в course_versions.regulatory_basis_codes.
      return resolveRegulatoryBasisCsv(cv, acts);
    case 'commission_name':
      return commission?.name ?? '';
    case 'commission_code':
      return commission?.code ?? '';
    default:
      return '';
  }
}

function resolveRegulatoryBasisCsv(cv: CourseVersion, acts: RegulatoryAct[]): string {
  const codes = cv.regulatoryBasisCodes ?? [];
  if (codes.length === 0) return '';
  const byCode = new Map(acts.map((a) => [a.code, a]));
  return codes
    .map((code) => byCode.get(code)?.shortName)
    .filter((name): name is string => Boolean(name))
    .join(', ');
}

export interface CommissionVariableContext {
  commission: Commission;
  members: CommissionMember[];
}

/** Информация об одном члене для `{commission.members}` JSON-массива. */
export interface CommissionMemberView {
  fullName: string;
  role: CommissionMember['role'];
  position: string;
  signatureFileId?: string;
  positionInOrder: number;
}

/**
 * Разрешает переменные категории `commission.*`. Источник имени и должности:
 * `external_full_name`/`external_position` для внешних экспертов; для
 * внутренних пользователей caller отвечает за резолв через IAM (передаёт
 * имя в `member.externalFullName` как override, либо ожидает что resolver
 * вернёт пустое значение — внутренние имена не хранятся в `commission_members`).
 *
 * Это compromise: связь с IAM хранится только id, реальные ФИО — отдельный
 * lookup. До Plan B (full IAM resolver) тенант должен либо использовать
 * external_full_name, либо принимать пустые поля для internal users.
 */
export function resolveCommissionVariables(
  ctx: CommissionVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const { commission, members } = ctx;
  const sorted = [...members].sort((a, b) => a.positionInOrder - b.positionInOrder);
  const chairman = sorted.find((m) => m.role === 'chairman');
  const secretary = sorted.find((m) => m.role === 'secretary');

  const result: Record<string, unknown> = {};
  for (const fullName of varNames) {
    if (!fullName.startsWith('commission.')) {
      result[fullName] = '';
      continue;
    }
    const key = fullName.slice('commission.'.length);
    result[fullName] = resolveCommissionKey(key, commission, sorted, chairman, secretary);
  }
  return result;
}

function resolveCommissionKey(
  key: string,
  commission: Commission,
  members: CommissionMember[],
  chairman: CommissionMember | undefined,
  secretary: CommissionMember | undefined
): unknown {
  switch (key) {
    case 'code':
      return commission.code;
    case 'name':
      return commission.name;
    case 'description':
      return commission.description ?? '';
    case 'chairman.name':
      return chairman?.externalFullName ?? '';
    case 'chairman.position':
      return chairman?.externalPosition ?? '';
    case 'chairman.signature_file_id':
      return chairman?.signatureFileId ?? '';
    case 'secretary.name':
      return secretary?.externalFullName ?? '';
    case 'secretary.position':
      return secretary?.externalPosition ?? '';
    case 'secretary.signature_file_id':
      return secretary?.signatureFileId ?? '';
    case 'members':
      // JSON-сериализуемый массив для таблиц в шаблонах.
      return members.map(
        (m): CommissionMemberView => ({
          fullName: m.externalFullName ?? '',
          role: m.role,
          position: m.externalPosition ?? '',
          signatureFileId: m.signatureFileId,
          positionInOrder: m.positionInOrder
        })
      );
    default:
      return '';
  }
}

// ============================================================================
// Plan B §5.5 — категории `enrollment.*` и `document.*`.
// ============================================================================

export interface EnrollmentVariableContext {
  enrollment: Enrollment;
}

/**
 * Разрешает переменные категории `enrollment.*`. Даты возвращаются как
 * `YYYY-MM-DD` (срез ISO-таймстампа); отсутствующие значения — пустая строка.
 *
 * `enrollment.end_date` — спека говорит "фактическая дата окончания". В нашей
 * модели это `completedAt`; для незавершённых учеников fallback на `plannedEndAt`
 * (последний даёт ожидаемую дату завершения — нужно для приказов о повторном
 * обучении до фактического завершения курса).
 */
export function resolveEnrollmentVariables(
  ctx: EnrollmentVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const e = ctx.enrollment;
  const result: Record<string, unknown> = {};
  for (const fullName of varNames) {
    if (!fullName.startsWith('enrollment.')) {
      result[fullName] = '';
      continue;
    }
    const key = fullName.slice('enrollment.'.length);
    result[fullName] = resolveEnrollmentKey(key, e);
  }
  return result;
}

function resolveEnrollmentKey(key: string, e: Enrollment): unknown {
  switch (key) {
    case 'id':
      return e.id;
    case 'status':
      return e.status ?? '';
    case 'start_date':
      return e.enrolledAt ? e.enrolledAt.slice(0, 10) : '';
    case 'end_date':
      if (e.completedAt) return e.completedAt.slice(0, 10);
      if (e.plannedEndAt) return e.plannedEndAt.slice(0, 10);
      return '';
    case 'completion_date':
      return e.completedAt ? e.completedAt.slice(0, 10) : '';
    default:
      return '';
  }
}

export interface DocumentVariableContext {
  document: GeneratedDocumentEntity;
  /** §5.8 — публичный base URL для построения document.qr_url. Caller передаёт frontendEnv.PUBLIC_BASE_URL. */
  publicBaseUrl?: string;
}

/**
 * Разрешает переменные категории `document.*`. С Plan C §5.8 `document.qr_url`
 * возвращает реальный URL `${publicBaseUrl}/verify/${qrToken}`; для legacy
 * документов без qrToken (Plan A/B) — пустая строка.
 */
export function resolveDocumentVariables(
  ctx: DocumentVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const d = ctx.document;
  const result: Record<string, unknown> = {};
  for (const fullName of varNames) {
    if (!fullName.startsWith('document.')) {
      result[fullName] = '';
      continue;
    }
    const key = fullName.slice('document.'.length);
    result[fullName] = resolveDocumentKey(key, d, ctx.publicBaseUrl);
  }
  return result;
}

function resolveDocumentKey(
  key: string,
  d: GeneratedDocumentEntity,
  publicBaseUrl: string | undefined
): unknown {
  switch (key) {
    case 'id':
      return d.id;
    case 'number':
      return d.documentNumber ?? '';
    case 'issue_date':
      if (d.documentDate) return d.documentDate;
      if (d.generatedAt) return d.generatedAt.slice(0, 10);
      return '';
    case 'type':
      return d.documentType ?? '';
    case 'qr_url':
      if (!d.qrToken || !publicBaseUrl) return '';
      return `${publicBaseUrl.replace(/\/+$/, '')}/verify/${d.qrToken}`;
    default:
      return '';
  }
}

// ============================================================================
// Plan B §5.7 — категория `group_learners` для приказов по группе.
// ============================================================================

/**
 * View для одного ученика в `group_learners` массиве. Pillar A Plan C §5.11
 * подключил реальные поля `snils`/`position`/`middleName` на `Learner`; теперь
 * используются вместо пустых строк.
 */
export interface GroupLearnerView {
  fullName: string;
  snils: string;
  position: string;
  enrolledAt: string;
  status: string;
  learnerNo: string;
}

export interface GroupLearnersVariableContext {
  learners: Learner[];
  enrollments: Enrollment[];
}

/**
 * Разрешает переменную `group_learners` (массив учеников группы) и скаляр
 * `group_learners_count` (число записей). Используется в приказах по группе —
 * шаблон рендерит таблицу учеников.
 *
 * Особенности:
 * - Сортировка по `lastName firstName` в русской локали — стабильный порядок
 *   в приказах независимо от order вставки.
 * - Учеников без matching enrollment отбрасывает (defensive — caller обязан
 *   передавать pair'ы, но если pipeline сломан, не падаем, а молча скипаем).
 * - `snils`/`position` — пустые строки (см. комментарий к `GroupLearnerView`).
 */
export function resolveGroupLearnersVariables(
  ctx: GroupLearnersVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const byLearnerId = new Map(ctx.enrollments.map((e) => [e.learnerId, e]));
  const views: GroupLearnerView[] = ctx.learners
    .map((l): GroupLearnerView | undefined => {
      const enr = byLearnerId.get(l.id);
      if (!enr) return undefined;
      const namePieces = [l.lastName, l.firstName, l.middleName].filter((piece): piece is string =>
        Boolean(piece && piece.trim())
      );
      const fullName = namePieces.join(' ').trim();
      return {
        fullName,
        snils: l.snils ?? '',
        position: l.position ?? '',
        enrolledAt: enr.enrolledAt ? enr.enrolledAt.slice(0, 10) : '',
        status: enr.status ?? '',
        learnerNo: l.learnerNo ?? ''
      };
    })
    .filter((v): v is GroupLearnerView => v !== undefined)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  const result: Record<string, unknown> = {};
  for (const name of varNames) {
    if (name === 'group_learners') {
      result[name] = views;
      continue;
    }
    if (name === 'group_learners_count') {
      result[name] = views.length;
      continue;
    }
    result[name] = '';
  }
  return result;
}
