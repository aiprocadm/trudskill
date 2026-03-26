export interface BaseFilterQuery {
  page?: number;
  page_size?: number;
  sort?: string;
  q?: string;
  status?: string;
  created_from?: string;
  created_to?: string;
  group_id?: string;
  learner_id?: string;
  course_id?: string;
  course_version_id?: string;
  module_id?: string;
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
  isRequired?: boolean;
}

export interface UpdateModuleRequest {
  title?: string;
  minViewSeconds?: number;
  isRequired?: boolean;
  status?: string;
}

export interface CreateMaterialRequest {
  moduleId: string;
  title: string;
  materialType: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds?: number;
  isRequired?: boolean;
  fileId?: string;
}

export interface UpdateMaterialRequest {
  title?: string;
  materialType?: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds?: number;
  isRequired?: boolean;
  status?: string;
  fileId?: string;
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
  enrollmentId: string;
  studiedSeconds: number;
}
