export type ClientStatus = 'active' | 'archived';

/**
 * МГ-D1.1 (срез 13.2): реквизиты контрагента как в CDOPROF. Имена совпадают с сущностью
 * бэкенда и с ответом подсказки по ИНН, поэтому подсказка кладётся в форму без перевода.
 */
export type ClientRequisiteKey =
  | 'shortName'
  | 'ogrn'
  | 'okpo'
  | 'okato'
  | 'oktmo'
  | 'okogu'
  | 'okopf'
  | 'okved'
  | 'postalAddress'
  | 'actualAddress'
  | 'region'
  | 'city'
  | 'postalCode'
  | 'fax'
  | 'directorName'
  | 'directorPosition'
  | 'managerUserId'
  | 'contractNumber'
  | 'contractDate';

export type ClientRequisites = Partial<Record<ClientRequisiteKey, string>>;

export interface ClientListItem extends ClientRequisites {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  legalName?: string;
  inn?: string;
  kpp?: string;
  contactEmail?: string;
  contactPhone?: string;
  legalAddress?: string;
  note?: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  /** ФИО менеджера — карточка подставляет его сама (`GET /counterparties/:id`). */
  managerName?: string | null;
}

export interface ClientsListResponse {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClientsListFilters {
  q?: string;
  status?: ClientStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateClientPayload extends ClientRequisites {
  code: string;
  name: string;
  legalName?: string;
  inn?: string;
  kpp?: string;
  contactEmail?: string;
  contactPhone?: string;
  legalAddress?: string;
  note?: string;
}

export interface UpdateClientPayload extends Partial<Record<ClientRequisiteKey, string | null>> {
  code?: string;
  name?: string;
  legalName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  legalAddress?: string | null;
  note?: string | null;
  status?: ClientStatus;
}

/** Ответ «Заполнить по ИНН» (`GET /counterparties/suggest?inn=`). */
export interface InnSuggestion {
  inn: string;
  /** Полное наименование с формой собственности. */
  name: string;
  shortName?: string;
  kpp?: string;
  ogrn?: string;
  okpo?: string;
  okato?: string;
  oktmo?: string;
  okogu?: string;
  okopf?: string;
  okved?: string;
  legalAddress?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  directorName?: string;
  directorPosition?: string;
  /** Организация ликвидирована или ликвидируется. */
  liquidated: boolean;
}

export interface PerCourseProgress {
  courseId: string;
  total: number;
  completed: number;
}

export interface ProgressSummaryBase {
  totalLearners: number;
  enrollments: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
  };
  avgCompletionRate: number;
  perCourse: PerCourseProgress[];
}

export interface ClientProgressSummary extends ProgressSummaryBase {
  counterpartyId: string;
}

export interface GroupProgressSummary extends ProgressSummaryBase {
  groupId: string;
}

export interface ClientEditFormState extends Record<ClientRequisiteKey, string> {
  code: string;
  name: string;
  legalName: string;
  inn: string;
  kpp: string;
  contactEmail: string;
  contactPhone: string;
  legalAddress: string;
  note: string;
  status: ClientStatus;
}
