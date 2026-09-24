export type LearnerStatus = 'active' | 'archived';

/** Личное дело (ТЗ перехода §4, МГ-C1.1): паспорт с сервера приходит маской (строкой), объектом — только после раскрытия. */
export interface LearnerPassport {
  series?: string;
  number?: string;
  issuedAt?: string;
  issuedBy?: string;
}

export interface LearnerDiploma {
  series?: string;
  number?: string;
  institution?: string;
  surnameInDiploma?: string;
}

export interface LearnerProfileFields {
  phone?: string;
  passport?: LearnerPassport | string;
  gender?: 'm' | 'f';
  birthPlace?: string;
  citizenship?: string;
  registrationAddress?: string;
  educationLevel?: string;
  diploma?: LearnerDiploma;
  trackingNumber?: string;
  deliveryMethod?: string;
  counterpartyId?: string;
  /** Именованные поля центра (МГ-C1.3): ключ → значение; описание — в настройках. */
  extraFields?: Record<string, string>;
}

export interface LearnerListItem extends LearnerProfileFields {
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

/** Карточка слушателя: то же, что строка списка (ручка одна, поля те же). */
export type LearnerProfile = LearnerListItem;

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
  /* Личное дело (МГ-C1.1): паспорт и диплом — отдельными полями формы. */
  phone: string;
  gender: '' | 'm' | 'f';
  citizenship: string;
  birthPlace: string;
  registrationAddress: string;
  educationLevel: string;
  passportSeries: string;
  passportNumber: string;
  passportIssuedAt: string;
  passportIssuedBy: string;
  diplomaSeries: string;
  diplomaNumber: string;
  diplomaInstitution: string;
  diplomaSurname: string;
  trackingNumber: string;
  deliveryMethod: string;
  counterpartyId: string;
  /** Именованные поля центра (МГ-C1.3): ключ → строка формы. */
  extraFields: Record<string, string>;
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
  dateOfBirth?: string | null;
  phone?: string | null;
  passport?: LearnerPassport | null;
  gender?: 'm' | 'f' | null;
  citizenship?: string | null;
  birthPlace?: string | null;
  registrationAddress?: string | null;
  educationLevel?: string | null;
  diploma?: LearnerDiploma | null;
  trackingNumber?: string | null;
  deliveryMethod?: string | null;
  counterpartyId?: string | null;
  /** Только изменённые ключи: сервер сливает по ключам, пустая строка удаляет (РМ87). */
  extraFields?: Record<string, string> | null;
}
