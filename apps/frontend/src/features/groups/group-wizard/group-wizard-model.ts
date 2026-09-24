import type {
  Group,
  GroupPayload,
  GroupWizardLearnerRow,
  GroupWizardOutcome,
  GroupWizardRequest,
  WizardAccessMode
} from '../../mvp/types';
import type { BulkOutcome } from '@trudskill/ui';

/**
 * Чистая логика мастера создания группы (ТЗ перехода §6.2, МГ-B2; срез 8.5).
 *
 * Экран держит состояние, а здесь — то, что можно проверить без React: разбор вставки
 * слушателей, проверка готовности шага, сборка тела `POST /groups/wizard` и сводка ответа.
 * Правила ввода (ФИО, СНИЛС, почта) НЕ повторяются на клиенте: проверяет сервер, чтобы
 * два набора правил не разъехались; клиент только режет строки и показывает предпросмотр.
 */
export type WizardStepId = 'who' | 'what' | 'learners' | 'access';

export interface WizardState {
  /** Черновик шага 1 на сервере (РМ52, РМ56): создаётся при первом «Далее», потом правится. */
  draftId: string | null;
  /** МГ-B6.1: мастер открыт как копия этой группы (РМ58). */
  copyOfGroupId: string | null;
  name: string;
  code: string;
  counterpartyId: string;
  comment: string;
  courseIds: string[];
  startDate: string;
  endDate: string;
  examDate: string;
  studyForm: string;
  existingLearnerIds: string[];
  learnerText: string;
  accessMode: WizardAccessMode;
  message: string;
}

export const EMPTY_WIZARD_STATE: WizardState = {
  draftId: null,
  copyOfGroupId: null,
  name: '',
  code: '',
  counterpartyId: '',
  comment: '',
  courseIds: [],
  startDate: '',
  endDate: '',
  examDate: '',
  studyForm: '',
  existingLearnerIds: [],
  learnerText: '',
  accessMode: 'email',
  message: ''
};

/**
 * Вставка «ФИО; должность; СНИЛС; email; телефон» построчно. Разделитель — «;» или
 * табуляция (так вставляется столбец из таблицы). Номер строки — физический номер в поле
 * ввода: по нему человек находит строку глазами, поэтому пустые строки номер занимают,
 * но в запрос не попадают.
 */
export const parseLearnerLines = (text: string): GroupWizardLearnerRow[] => {
  const rows: GroupWizardLearnerRow[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const [fullName = '', position, snils, email, phone] = line
      .split(/;|\t/)
      .map((cell) => cell.trim());
    rows.push({
      rowNumber: index + 1,
      fullName,
      ...(position ? { position } : {}),
      ...(snils ? { snils } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {})
    });
  });
  return rows;
};

/** Поля группы для черновика (`POST /groups`) и правки черновика (`PUT /groups/:id`). */
export const groupPayloadOf = (state: WizardState, responsibleUserId: string): GroupPayload => ({
  name: state.name.trim(),
  ...(state.code.trim() ? { code: state.code.trim() } : {}),
  ...(state.counterpartyId ? { counterpartyId: state.counterpartyId } : {}),
  ...(state.comment.trim() ? { comment: state.comment.trim() } : {}),
  ...(state.startDate ? { startDate: state.startDate } : {}),
  ...(state.endDate ? { endDate: state.endDate } : {}),
  ...(state.examDate ? { examDate: state.examDate } : {}),
  ...(state.studyForm ? { studyForm: state.studyForm } : {}),
  /* РМ54: «ответственный — по умолчанию я»; выбор другого сотрудника — в карточке. */
  responsibleUserId
});

/** Тело завершения мастера: тот же ключ при повторе → сервер вернёт прежний результат. */
export const buildWizardRequest = (
  state: WizardState,
  idempotencyKey: string,
  responsibleUserId: string
): GroupWizardRequest => {
  const rows = parseLearnerLines(state.learnerText);
  const learners = {
    ...(state.existingLearnerIds.length ? { existingIds: state.existingLearnerIds } : {}),
    ...(rows.length ? { rows } : {})
  };
  return {
    idempotencyKey,
    group: {
      ...groupPayloadOf(state, responsibleUserId),
      ...(state.draftId ? { draftId: state.draftId } : {})
    },
    ...(state.copyOfGroupId ? { copyOfGroupId: state.copyOfGroupId } : {}),
    courses: state.courseIds.map((courseId) => ({ courseId })),
    ...(Object.keys(learners).length ? { learners } : {}),
    access: {
      mode: state.accessMode,
      ...(state.message.trim() ? { message: state.message.trim() } : {})
    }
  };
};

/** Можно ли уйти с шага дальше; причина — текст для кнопки «чего не хватает» (Э8). */
export const canProceed = (
  step: WizardStepId,
  state: WizardState
): { ok: true } | { ok: false; reason: string } => {
  if (step === 'who') {
    if (state.name.trim().length < 3) {
      return { ok: false, reason: 'Укажите название группы — не короче 3 символов.' };
    }
    if (state.code.trim() && state.code.trim().length < 2) {
      return { ok: false, reason: 'Свой код группы — не короче 2 символов, или оставьте пустым.' };
    }
    return { ok: true };
  }
  if (step === 'what') {
    if (state.courseIds.length === 0) {
      return { ok: false, reason: 'Выберите хотя бы один курс — без курса группе нечему учить.' };
    }
    if (state.startDate && state.endDate && state.endDate < state.startDate) {
      return { ok: false, reason: 'Окончание обучения не может быть раньше начала.' };
    }
    if (state.startDate && state.examDate && state.examDate < state.startDate) {
      return { ok: false, reason: 'Дата экзамена не может быть раньше начала обучения.' };
    }
    return { ok: true };
  }
  return { ok: true };
};

/**
 * Ключ идемпотентности меняется только после отказа сервера по вине запроса (4xx):
 * человек исправит данные и отправит новое тело. После сбоя сети или 5xx ключ остаётся —
 * повтор вернёт прежний результат, если первый запрос всё же дошёл (РМ57).
 */
export const shouldRotateKey = (error: unknown): boolean => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
};

export const ROW_STATUS_LABEL: Record<
  GroupWizardOutcome['enrollments']['rows'][number]['status'],
  string
> = {
  created: 'заведён и зачислен',
  reused: 'найден в базе и зачислен',
  enrolled_only: 'уже был зачислен',
  failed: 'не зачислен'
};

/** Подпись строки сводки: ФИО из вставки или имя выбранного слушателя, номер — чтобы найти. */
export const wizardRowLabel = (
  row: GroupWizardOutcome['enrollments']['rows'][number],
  names: { byRow: Map<number, string>; byLearner: Map<string, string> }
): string => {
  if (row.rowNumber === 0) {
    return (row.learnerId && names.byLearner.get(row.learnerId)) || 'Слушатель из базы';
  }
  const name = names.byRow.get(row.rowNumber);
  return name ? `${name} (строка ${row.rowNumber})` : `Строка ${row.rowNumber}`;
};

/** Сводка частичного успеха для `OperationOutcome`: успех — всё, что не `failed`. */
export const wizardOutcomeSummary = (
  outcome: GroupWizardOutcome,
  names: { byRow: Map<number, string>; byLearner: Map<string, string> }
): BulkOutcome => {
  const rows = outcome.enrollments.rows;
  return {
    total: rows.length,
    succeeded: rows.filter((row) => row.status !== 'failed').length,
    failures: rows
      .filter((row) => row.status === 'failed')
      .map((row) => ({
        label: wizardRowLabel(row, names),
        reason: row.errorMessage?.trim() || 'Сервер отклонил строку, причина не указана'
      }))
  };
};

/** Что стало с доступами — одной фразой на экране результата. */
export const accessSummary = (outcome: GroupWizardOutcome): string => {
  const succeeded = outcome.enrollments.rows.filter((row) => row.status !== 'failed').length;
  if (outcome.access.mode === 'email') {
    if (succeeded === 0) return 'Письма отправлять некому — в группе пока нет зачисленных.';
    if (outcome.access.sent === 0) {
      return 'Письма не ушли: у зачисленных нет почты. Выдайте доступы из карточки группы.';
    }
    return outcome.access.sent === succeeded
      ? `Письма с приглашением отправлены всем: ${outcome.access.sent}.`
      : `Письма отправлены: ${outcome.access.sent} из ${succeeded} — у остальных нет почты.`;
  }
  if (outcome.access.mode === 'sheet') {
    return 'Лист доступов появится вместе с входом по логину; пока доступы выдаются из карточки группы.';
  }
  return 'Доступы пока не выдавали — сделайте это из карточки группы, когда будете готовы.';
};

/* ---- Копия группы (МГ-B6.1, РМ58–РМ60) ---- */

const DAY_MS = 86_400_000;
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Местная дата браузера `YYYY-MM-DD`: человек видит и правит даты в своём календаре. */
export const todayLocalIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

const utcOf = (iso: string): number => {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** `YYYY-MM-DD` ± дни без сдвига часовых поясов (счёт в UTC по календарным датам). */
export const addDaysIso = (iso: string, days: number): string =>
  new Date(utcOf(iso) + days * DAY_MS).toISOString().slice(0, 10);

/** Целых дней от `from` до `to` (отрицательное — если `to` раньше). */
export const daysBetweenIso = (from: string, to: string): number =>
  Math.round((utcOf(to) - utcOf(from)) / DAY_MS);

/**
 * Состояние мастера для копии (ТЗ §6.3 МГ-B6.1): та же компания, курсы, настройки; код новый
 * (пустой → по шаблону центра); даты сдвинуты на «сегодня − начало» (РМ60); слушатели —
 * все с незавершёнными зачислениями, без повторов (РМ59); доступы — «позже» (люди уже в системе).
 */
export const copyStateFrom = (
  source: {
    group: Pick<
      Group,
      | 'id'
      | 'name'
      | 'counterpartyId'
      | 'comment'
      | 'startDate'
      | 'endDate'
      | 'examDate'
      | 'studyForm'
    >;
    courseIds: string[];
    enrollments: ReadonlyArray<{ learnerId: string; status: string }>;
  },
  today: string
): WizardState => {
  const { group } = source;
  const delta = group.startDate ? daysBetweenIso(group.startDate, today) : 0;
  const shift = (iso: string | undefined): string =>
    group.startDate && iso ? addDaysIso(iso, delta) : '';
  const learnerIds = Array.from(
    new Set(
      source.enrollments
        .filter((enrollment) => enrollment.status !== 'cancelled')
        .map((enrollment) => enrollment.learnerId)
    )
  );
  return {
    ...EMPTY_WIZARD_STATE,
    copyOfGroupId: group.id,
    name: `${group.name} (копия)`,
    counterpartyId: group.counterpartyId ?? '',
    comment: group.comment ?? '',
    courseIds: Array.from(new Set(source.courseIds)),
    startDate: shift(group.startDate),
    endDate: shift(group.endDate),
    examDate: shift(group.examDate),
    studyForm: group.studyForm ?? '',
    existingLearnerIds: learnerIds,
    accessMode: 'later'
  };
};

export const ACCESS_MODE_LABEL: Record<WizardAccessMode, string> = {
  email: 'Письмом на почту',
  sheet: 'Листом доступов',
  later: 'Позже, из карточки группы'
};
