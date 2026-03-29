export const webinarsContractGroup = {
  tag: 'webinars',
  description: 'Webinar registry and participants foundation.'
} as const;

export const webinarsEndpoints = {
  list: '/webinars',
  details: '/webinars/:id',
  participants: '/webinars/:id/participants'
} as const;

export type WebinarStatus = 'draft' | 'planned' | 'live' | 'completed' | 'cancelled';
