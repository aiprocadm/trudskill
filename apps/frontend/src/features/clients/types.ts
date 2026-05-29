export type ClientStatus = 'active' | 'archived';

export interface ClientListItem {
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

export interface CreateClientPayload {
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

export interface UpdateClientPayload {
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

export interface ClientEditFormState {
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
