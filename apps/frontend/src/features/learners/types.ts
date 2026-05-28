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
  position: string;
  organizationUnitId: string;
  learnerNo: string;
  status: LearnerStatus;
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
