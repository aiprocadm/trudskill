export const testsContractGroup = {
  tag: 'tests.attempts.results',
  description: 'Assessment domain endpoints: question banks, questions, tests, attempts, results and assignments.',
  endpoints: [
    '/question-banks',
    '/questions',
    '/tests',
    '/attempts',
    '/answers',
    '/exam-results',
    '/assignments',
    '/assignment-submissions',
    '/assignment-reviews'
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
  '/assignment-reviews'
] as const;
