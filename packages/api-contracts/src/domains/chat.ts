export const chatContractGroup = {
  tag: 'chat',
  description: 'Dialogs and text chat foundation endpoints.'
} as const;

export const chatEndpoints = {
  dialogs: '/chat/dialogs',
  dialogDetails: '/chat/dialogs/:id',
  dialogMessages: '/chat/dialogs/:id/messages',
  dialogRead: '/chat/dialogs/:id/read'
} as const;

export type ChatDialogType = 'direct' | 'entity_linked' | 'support';
export type ChatMessageType = 'text' | 'system';
