export const DOCUMENTS_ARRAY_COLLECTIONS = [
  'templates',
  'versions',
  'variables',
  'bindings',
  'tasks',
  'generatedDocuments',
  'numberingRules',
  'reservations'
] as const;

export type DocumentsArrayCollection = (typeof DOCUMENTS_ARRAY_COLLECTIONS)[number];
