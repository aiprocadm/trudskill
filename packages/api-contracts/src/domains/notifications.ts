export const notificationsContractGroup = {
  tag: 'notifications',
  description: 'In-app notification center foundation with realtime delivery.'
} as const;

export const notificationsEndpoints = {
  list: '/notifications',
  details: '/notifications/:id',
  readOne: '/notifications/:id/read',
  readAll: '/notifications/read-all',
  unreadCounter: '/notifications/unread-counter'
} as const;

export type NotificationChannelCode = 'in_app';
export type NotificationStatus = 'unread' | 'read';
