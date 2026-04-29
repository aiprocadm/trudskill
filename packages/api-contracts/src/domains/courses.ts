export const coursesContractGroup = {
  tag: 'directions.courses.modules.materials',
  description:
    'Course authoring, versioning, enrollment assignments and progress tracking endpoints for LMS flows.'
} as const;

export const courseAuthoringEndpoints = {
  directions: ['/directions', '/directions/:id'],
  courses: ['/courses', '/courses/:id', '/courses/:id/publish', '/courses/:id/archive'],
  courseVersions: ['/course-versions', '/course-versions/:id', '/course-versions/:courseId'],
  modules: ['/modules', '/modules/:id'],
  materials: ['/materials', '/materials/:id']
} as const;

export const enrollmentProgressEndpoints = {
  groups: ['/groups', '/groups/:id', '/group-courses', '/group-courses/:id'],
  /** GET /enrollments supports planned_end_from, planned_end_to (ISO), group_id, learner_id, page_size */
  enrollments: ['/enrollments', '/enrollments/:id', '/enrollments/:id/status', '/enrollments/:id/status-history'],
  progress: ['/progress', '/progress/:id', '/progress/materials/:materialId']
} as const;
