export const mvpDomainSchemas = [
  'crm',
  'learning',
  'assessment',
  'documents',
  'storage'
] as const;

export const mvpDomainTables = {
  crm: ['counterparties', 'counterparty_contacts', 'counterparty_employees'],
  learning: [
    'learners',
    'directions',
    'courses',
    'course_versions',
    'course_settings',
    'course_modules',
    'materials',
    'material_versions',
    'study_groups',
    'group_courses',
    'enrollments',
    'enrollment_status_history',
    'course_progress',
    'module_progress',
    'material_progress'
  ],
  assessment: [
    'tests',
    'questions',
    'test_questions',
    'answer_options',
    'test_attempts',
    'attempt_answers',
    'exam_results'
  ],
  documents: [
    'templates',
    'template_versions',
    'template_variables',
    'template_bindings',
    'generated_documents',
    'numbering_rules',
    'number_reservations'
  ],
  storage: ['files', 'file_links']
} as const;

export type MvpDomainSchemaName = (typeof mvpDomainSchemas)[number];
