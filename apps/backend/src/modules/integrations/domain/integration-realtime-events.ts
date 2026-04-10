/** Имена realtime-событий интеграций (экспорт); держим в domain для переиспользования и контрактов. */
export const IntegrationExportRealtimeEvents = {
  requested: 'integration.export.requested',
  started: 'integration.export.started',
  failed: 'integration.export.failed',
  completed: 'integration.export.completed'
} as const;
