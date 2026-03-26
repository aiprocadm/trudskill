export interface BaseFilterQuery {
  page?: number;
  page_size?: number;
  sort?: string;
  q?: string;
  status?: string;
  created_from?: string;
  created_to?: string;
}

export interface CreateSimpleRegistryRequest {
  code: string;
  name: string;
  status?: string;
}

export interface UpdateSimpleRegistryRequest {
  code?: string;
  name?: string;
  status?: string;
}

export interface CreateCourseRequest {
  code: string;
  title: string;
  description?: string;
}

export interface UpdateCourseRequest {
  title?: string;
  description?: string;
}

export interface CreateModuleRequest {
  courseVersionId: string;
  title: string;
  minViewSeconds?: number;
}

export interface CreateMaterialRequest {
  moduleId: string;
  title: string;
  materialType: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds?: number;
}

export interface CreateGroupCourseRequest {
  groupId: string;
  courseId: string;
}

export interface CreateEnrollmentRequest {
  groupId: string;
  learnerId: string;
}

export interface UpdateEnrollmentStatusRequest {
  status: 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';
  reason?: string;
}

export interface UpdateMaterialProgressRequest {
  studiedSeconds: number;
}
