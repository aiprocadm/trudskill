export type LearnerStatus = 'active' | 'archived';

export interface LearnerListItem {
  id: string;
  tenantId: string;
  learnerNo?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  snils?: string;
  /** Вопрос №12: обязательна для выгрузки в госреестры, но не для заведения слушателя. */
  dateOfBirth?: string;
  position?: string;
  organizationUnitId?: string;
  linkedIamUserId?: string;
  status: LearnerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LearnersListResponse {
  items: LearnerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LearnersListFilters {
  q?: string;
  status?: LearnerStatus;
  page?: number;
  pageSize?: number;
}

export interface LearnerEditFormState {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  snils: string;
  dateOfBirth: string;
  position: string;
  organizationUnitId: string;
  learnerNo: string;
  status: LearnerStatus;
}

/**
 * ФТ-G6: отчёт об обезличивании. Перечисляет и стёртое, и СОХРАНЁННОЕ с основанием —
 * администратору этим отвечать заявителю, а «данные удалены» без оговорок было бы
 * неправдой: документы об обучении остаются.
 */
export interface LearnerErasureReport {
  learnerId: string;
  erasedFields: string[];
  retained: { what: string; reason: string }[];
  identityImagesPurged: number;
}

export interface UpdateLearnerProfilePayload {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  email?: string | null;
  snils?: string | null;
  position?: string | null;
  organizationUnitId?: string | null;
  learnerNo?: string | null;
  status?: LearnerStatus;
}
