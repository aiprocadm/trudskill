import type {
  Counterparty,
  CourseProgress,
  Enrollment,
  GroupEntity,
  Learner
} from '../mvp.types.js';

/**
 * Панель руководителя (ТЗ «Стабилизация, UX и развитие», 8.3).
 *
 * **Зачем она вообще.** У руководителя не было своей стартовой страницы: вход приводил его
 * прямо в список групп, а меню добивалось до семи пунктов чем попало, и под «Ещё» лежало
 * почти полное админское меню. ТЗ требует собрать кабинет вокруг четырёх вопросов:
 * «как идёт обучение по моим компаниям», «кто не успевает», «что горит по срокам»,
 * «сколько выдано документов».
 *
 * **Почему чистая функция.** Панель считается из снимка состояния и даты `asOf`. Панель,
 * которую нельзя проверить тестом на конкретную дату, начинает врать незаметно: сегодня
 * «просрочек нет» потому что их правда нет, а завтра — потому что сломался расчёт.
 *
 * **Чего здесь намеренно НЕТ.** Понятия «МОЯ компания» в системе не существует: у
 * `crm.counterparties` нет ответственного менеджера. Заводить его ради панели нельзя —
 * кто назначает ответственного и что делать с уже заведёнными компаниями, решает владелец.
 * Поэтому панель показывает компании ЦЕНТРА — ровно то, что руководитель и так имеет право
 * видеть по `counterparties.read`.
 */

/** Ключ панели в свободном наборе настроек центра (`org.tenant_settings.payload`). */
export const MANAGER_DASHBOARD_SETTINGS_KEY = 'managerDashboard';

export interface ManagerDashboardSettings {
  /** За сколько дней до срока считать, что «горит». */
  horizonDays: number;
  /**
   * Насколько человеку позволено отставать от графика, в процентных пунктах.
   *
   * Обучение редко идёт равномерно: человек берёт два модуля в выходные и неделю не заходит.
   * Без допуска в отстающие попал бы каждый, и список перестал бы что-либо значить.
   */
  laggingTolerancePercent: number;
}

/**
 * Умолчания. Правило репозитория: всё, что выглядит как срок или порог, — настройка со
 * значением по умолчанию, а не число в коде. Две недели — тот же горизонт, что у сводки
 * обучения: показывать руководителю и методисту разные «ближайшие сроки» значило бы
 * поссорить их на планёрке.
 */
export const MANAGER_DASHBOARD_DEFAULTS: ManagerDashboardSettings = {
  horizonDays: 14,
  laggingTolerancePercent: 10
};

/** Дальше года вперёд «ближайшим сроком» не бывает — это уже планирование, а не панель. */
const MAX_HORIZON_DAYS = 365;

const readPositive = (raw: unknown, max: number): number | null => {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded <= 0 || rounded > max) return null;
  return rounded;
};

/**
 * Настройки панели у центра, иначе умолчания.
 *
 * Настройка человека может прийти испорченной — строкой вместо числа, нулём, отрицательным
 * значением, вообще не объектом. Непригодное значение откатывается к умолчанию поштучно:
 * сломанный допуск не должен заодно сбивать горизонт.
 */
export const managerDashboardSettings = (
  payload: Record<string, unknown> | undefined
): ManagerDashboardSettings => {
  const raw = payload?.[MANAGER_DASHBOARD_SETTINGS_KEY];
  if (!raw || typeof raw !== 'object') return MANAGER_DASHBOARD_DEFAULTS;
  const source = raw as Record<string, unknown>;
  return {
    horizonDays:
      readPositive(source.horizonDays, MAX_HORIZON_DAYS) ?? MANAGER_DASHBOARD_DEFAULTS.horizonDays,
    laggingTolerancePercent:
      readPositive(source.laggingTolerancePercent, 100) ??
      MANAGER_DASHBOARD_DEFAULTS.laggingTolerancePercent
  };
};

/** Документ ровно в том объёме, в каком панель его считает. */
export interface IssuedDocumentRef {
  sourceEntityType: string;
  sourceEntityId: string;
  isFinal: boolean;
  status: string;
}

export interface ManagerDashboardInput {
  counterparties: Counterparty[];
  groups: GroupEntity[];
  learners: Learner[];
  enrollments: Enrollment[];
  courseProgress: CourseProgress[];
  documents: IssuedDocumentRef[];
}

export interface CompanyTraining {
  counterpartyId: string;
  companyName: string;
  groupsCount: number;
  /** Людей, у кого обучение идёт прямо сейчас. */
  learnersInTraining: number;
  completed: number;
  overdue: number;
  documentsIssued: number;
}

export interface LaggingLearner {
  learnerId: string;
  learnerName: string;
  groupId: string;
  groupName: string;
  companyName?: string;
  /** Отрицательное — срок уже вышел. */
  daysLeft: number;
  progressPercent: number;
  /** Почему человек в списке: срок вышел или идёт медленнее графика. */
  reason: 'overdue' | 'behind';
}

export interface GroupDueSoon {
  groupId: string;
  groupName: string;
  companyName?: string;
  dueAt: string;
  daysLeft: number;
  learnersCount: number;
}

export interface ManagerDashboard {
  asOf: string;
  horizonDays: number;
  totals: {
    companies: number;
    learnersInTraining: number;
    lagging: number;
    dueSoon: number;
    documentsIssued: number;
    /** Группы без компании: иначе руководитель решит, что видит в разделе компаний всё. */
    groupsWithoutCompany: number;
  };
  companies: CompanyTraining[];
  lagging: LaggingLearner[];
  dueSoon: GroupDueSoon[];
}

/** Целые дни между двумя ISO-датами; отрицательное — дата в прошлом. */
const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.parse(fromIso.slice(0, 10));
  const to = Date.parse(toIso.slice(0, 10));
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
};

/** Зачисления, по которым обучение ещё идёт: у завершённых и отменённых срока нет. */
const isOpen = (enrollment: Enrollment): boolean =>
  enrollment.status === 'active' || enrollment.status === 'pending';

/**
 * Документ считается ВЫДАННЫМ, если он окончательный и не аннулирован.
 *
 * Черновик на руках у человека не оказывается, а аннулированный при проверке недействителен —
 * складывать их с настоящими значило бы отчитываться бумагой, которой нет.
 */
const isIssued = (document: IssuedDocumentRef): boolean =>
  document.isFinal && document.status !== 'revoked';

const fullName = (learner: Learner): string =>
  [learner.lastName, learner.firstName, learner.middleName].filter(Boolean).join(' ').trim() ||
  learner.id;

/**
 * Отстаёт ли человек от графика.
 *
 * Считается доля прошедшего времени обучения против доли пройденной программы. Если человек
 * прошёл заметно меньше, чем «натикало» по календарю, — он не успеет, и вмешиваться надо
 * сейчас, а не в день срока. Без даты начала или без срока сравнивать не с чем: такой человек
 * не отстающий, а просто ненастроенный, и придумывать за него график нельзя.
 */
const isBehindSchedule = (
  enrollment: Enrollment,
  progressPercent: number,
  asOf: string,
  tolerance: number
): boolean => {
  if (!enrollment.plannedEndAt || !enrollment.enrolledAt) return false;
  const total = daysBetween(enrollment.enrolledAt, enrollment.plannedEndAt);
  if (total <= 0) return false;
  const elapsed = daysBetween(enrollment.enrolledAt, asOf);
  if (elapsed <= 0) return false;
  const expectedPercent = Math.min(100, (elapsed / total) * 100);
  return progressPercent + tolerance < expectedPercent;
};

export function buildManagerDashboard(
  input: ManagerDashboardInput,
  asOf: string,
  settings: ManagerDashboardSettings = MANAGER_DASHBOARD_DEFAULTS
): ManagerDashboard {
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const learnerById = new Map(input.learners.map((learner) => [learner.id, learner]));
  const companyById = new Map(input.counterparties.map((item) => [item.id, item]));

  const groupName = (group: GroupEntity): string => group.name || group.code || group.id;
  const companyNameOfGroup = (group: GroupEntity | undefined): string | undefined => {
    if (!group?.counterpartyId) return undefined;
    const company = companyById.get(group.counterpartyId);
    return company ? company.name || company.code : undefined;
  };

  // Прогресс берётся максимальный по зачислению: у зачисления может быть несколько курсов,
  // и «сколько пройдено» по самому дальнему честнее, чем по первому попавшемуся.
  const progressByEnrollment = new Map<string, number>();
  for (const row of input.courseProgress) {
    const current = progressByEnrollment.get(row.enrollmentId) ?? 0;
    if (row.progressPercent > current)
      progressByEnrollment.set(row.enrollmentId, row.progressPercent);
  }

  const documentsByEnrollment = new Map<string, number>();
  for (const document of input.documents) {
    if (document.sourceEntityType !== 'enrollment' || !isIssued(document)) continue;
    documentsByEnrollment.set(
      document.sourceEntityId,
      (documentsByEnrollment.get(document.sourceEntityId) ?? 0) + 1
    );
  }

  const companyStats = new Map<string, CompanyTraining>();
  const lagging: LaggingLearner[] = [];
  const dueSoonByGroup = new Map<string, GroupDueSoon>();
  const groupsSeen = new Set<string>();
  const groupsWithoutCompany = new Set<string>();
  let learnersInTraining = 0;

  for (const enrollment of input.enrollments) {
    const group = groupById.get(enrollment.groupId);
    if (!group) continue;
    groupsSeen.add(group.id);
    if (!group.counterpartyId) groupsWithoutCompany.add(group.id);

    const companyId = group.counterpartyId;
    const company = companyId ? companyById.get(companyId) : undefined;
    if (companyId && company) {
      const row = companyStats.get(companyId) ?? {
        counterpartyId: companyId,
        companyName: company.name || company.code,
        groupsCount: 0,
        learnersInTraining: 0,
        completed: 0,
        overdue: 0,
        documentsIssued: 0
      };
      companyStats.set(companyId, row);
    }
    const companyRow = companyId ? companyStats.get(companyId) : undefined;

    if (companyRow) {
      companyRow.documentsIssued += documentsByEnrollment.get(enrollment.id) ?? 0;
      if (enrollment.status === 'completed') companyRow.completed += 1;
    }

    if (!isOpen(enrollment)) continue;
    learnersInTraining += 1;
    if (companyRow) companyRow.learnersInTraining += 1;
    if (!enrollment.plannedEndAt) continue;

    const daysLeft = daysBetween(asOf, enrollment.plannedEndAt);
    const progressPercent = Math.round(progressByEnrollment.get(enrollment.id) ?? 0);
    const learner = learnerById.get(enrollment.learnerId);
    const companyName = companyNameOfGroup(group);

    if (daysLeft < 0) {
      if (companyRow) companyRow.overdue += 1;
      if (learner) {
        lagging.push({
          learnerId: learner.id,
          learnerName: fullName(learner),
          groupId: group.id,
          groupName: groupName(group),
          ...(companyName ? { companyName } : {}),
          daysLeft,
          progressPercent,
          reason: 'overdue'
        });
      }
      // Просроченные в «ближайшие сроки» не попадают: они уже в списке отстающих, и
      // дублировать их значило бы завысить число дел вдвое.
      continue;
    }

    if (daysLeft <= settings.horizonDays) {
      const existing = dueSoonByGroup.get(group.id);
      if (!existing || daysLeft < existing.daysLeft) {
        dueSoonByGroup.set(group.id, {
          groupId: group.id,
          groupName: groupName(group),
          ...(companyName ? { companyName } : {}),
          dueAt: enrollment.plannedEndAt,
          daysLeft,
          learnersCount: 1
        });
      } else if (daysLeft === existing.daysLeft) {
        existing.learnersCount += 1;
      }
    }

    if (
      learner &&
      isBehindSchedule(enrollment, progressPercent, asOf, settings.laggingTolerancePercent)
    ) {
      lagging.push({
        learnerId: learner.id,
        learnerName: fullName(learner),
        groupId: group.id,
        groupName: groupName(group),
        ...(companyName ? { companyName } : {}),
        daysLeft,
        progressPercent,
        reason: 'behind'
      });
    }
  }

  for (const groupId of groupsSeen) {
    const group = groupById.get(groupId);
    const companyId = group?.counterpartyId;
    const row = companyId ? companyStats.get(companyId) : undefined;
    if (row) row.groupsCount += 1;
  }

  // Порядок = порядок срочности: сначала уже просроченные, потом отстающие по графику,
  // внутри — кто дальше от нормы. Руководитель читает список сверху и звонит первому.
  lagging.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'overdue' ? -1 : 1;
    return a.daysLeft - b.daysLeft;
  });
  const dueSoon = [...dueSoonByGroup.values()].sort((a, b) => a.daysLeft - b.daysLeft);
  const companies = [...companyStats.values()].sort((a, b) => {
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    return a.companyName.localeCompare(b.companyName, 'ru');
  });

  return {
    asOf,
    horizonDays: settings.horizonDays,
    totals: {
      companies: companies.length,
      learnersInTraining,
      lagging: lagging.length,
      dueSoon: dueSoon.length,
      documentsIssued: companies.reduce((sum, item) => sum + item.documentsIssued, 0),
      groupsWithoutCompany: groupsWithoutCompany.size
    },
    companies,
    lagging,
    dueSoon
  };
}
