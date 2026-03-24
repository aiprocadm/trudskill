export const groupsContractGroup = {
  tag: 'groups.enrollments.progress',
  description: 'Groups, enrollments and learning progress contract group skeleton.'
} as const;

export const ContractDomainGroups = [
  'auth',
  'users.roles.permissions',
  'learners',
  'directions.courses.modules.materials',
  'groups.enrollments.progress',
  'tests.attempts.results',
  'templates.documents',
  'notifications',
  'async.tasks.files'
] as const;
