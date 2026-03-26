export const testsContractGroup = {
  tag: 'tests.attempts.results',
  description: 'Assessment domain contracts: question banks, questions, tests, attempts, results, assignments.'
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
