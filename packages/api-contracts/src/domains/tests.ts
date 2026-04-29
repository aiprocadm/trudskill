export const testsContractGroup = {
  tag: 'tests.attempts.results',
  description:
    'Assessment and grading endpoints: question banks, tests, attempts, assignment submissions and review queue.',
  endpoints: [
    '/question-banks',
    '/questions',
    '/tests',
    '/attempts',
    '/answers',
    '/exam-results',
    '/assignments',
    '/assignment-submissions',
    '/assignment-submissions/:id/submit',
    '/assignment-reviews',
    '/assignment-reviews/:id',
    '/assignment-reviews/:id/complete'
  ]
} as const;

export const assessmentEndpoints = [
  '/question-banks',
  '/questions',
  '/tests',
  '/attempts',
  '/answers',
  '/exam-results',
  '/assignments',
  '/assignment-submissions',
  '/assignment-submissions/:id/submit',
  '/assignment-reviews',
  '/assignment-reviews/:id',
  '/assignment-reviews/:id/complete'
] as const;

export const gradingQueueEndpoints = {
  submissions: ['/assignment-submissions', '/assignment-submissions/:id', '/assignment-submissions/:id/submit'],
  reviews: ['/assignment-reviews', '/assignment-reviews/:id', '/assignment-reviews/:id/complete'],
  results: ['/exam-results', '/exam-results/:id', '/exam-results/by-enrollment/:enrollmentId']
} as const;
