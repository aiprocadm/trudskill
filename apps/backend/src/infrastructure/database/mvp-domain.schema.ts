export const mvpDomainSchemas = [
  'crm',
  'learning',
  'assessment',
  'documents',
  'storage',
  'esign'
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
    'question_banks',
    'tests',
    'test_rules',
    'questions',
    'test_questions',
    'answer_options',
    'test_attempts',
    'attempt_answers',
    'exam_results',
    'assignments',
    'assignment_submissions',
    'assignment_reviews'
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
  storage: ['files', 'file_links'],
  esign: ['esign_applications', 'esign_application_files', 'signing_processes', 'signing_participants', 'signature_events', 'legal_log_entries']
} as const;

export const mvpDomainTableList = Object.entries(mvpDomainTables).flatMap(([schema, tables]) =>
  tables.map((table) => `${schema}.${table}`)
);

export const mvpTablesWithSoftDelete = [
  'crm.counterparties',
  'crm.counterparty_contacts',
  'crm.counterparty_employees',
  'learning.learners',
  'learning.directions',
  'learning.courses',
  'learning.study_groups',
  'storage.file_links'
] as const;

export type MvpDomainSchemaName = (typeof mvpDomainSchemas)[number];
