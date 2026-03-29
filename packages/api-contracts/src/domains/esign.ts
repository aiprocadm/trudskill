export const esignContractGroup = {
  tag: 'esign',
  description: 'Legally significant e-signature contour: applications, signing workflows, participants, events and legal log.'
} as const;

export const esignEndpoints = {
  applications: ['/esign/applications', '/esign/applications/:id', '/esign/applications/:id/submit', '/esign/applications/:id/start-review', '/esign/applications/:id/approve', '/esign/applications/:id/reject', '/esign/applications/:id/reuse-check'],
  applicationFiles: ['/esign/application-files', '/esign/application-files/:id', '/esign/application-files/:id/verify', '/esign/application-files/:id/reject', '/esign/application-files/:id'],
  processes: ['/esign/processes', '/esign/processes/:id', '/esign/processes/:id/start', '/esign/processes/:id/cancel', '/esign/processes/:id/status'],
  participants: ['/esign/participants', '/esign/participants/:id', '/esign/participants/:id/invite', '/esign/participants/:id/mark-viewed', '/esign/participants/:id/sign', '/esign/participants/:id/reject', '/esign/participants/:id/skip'],
  events: ['/esign/events', '/esign/events/:id'],
  legalLog: ['/esign/legal-log', '/esign/legal-log/:id']
} as const;
