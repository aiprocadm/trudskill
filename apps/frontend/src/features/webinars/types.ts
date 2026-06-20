export type WebinarStatus = 'draft' | 'planned' | 'live' | 'completed' | 'cancelled';
export type WebinarProviderCode = 'noop' | 'fake' | 'jitsi' | 'pruffme' | 'zoom' | 'bbb';

export interface Webinar {
  id: string;
  title: string;
  description?: string;
  status: WebinarStatus;
  plannedStartAt: string;
  plannedEndAt: string;
  providerCode?: string;
  joinUrl?: string;
  hostUrl?: string;
}

export interface WebinarParticipant {
  learnerId?: string;
  userId?: string;
  roleCode: string;
  attendanceStatus: 'invited' | 'joined' | 'left';
  durationSeconds?: number;
}

export interface CreateWebinarInput {
  title: string;
  description?: string;
  groupId?: string;
  courseId?: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface ProviderSettings {
  providerCode: WebinarProviderCode;
  baseUrl?: string;
  enabled: boolean;
}

export const WEBINAR_STATUS_LABELS: Record<WebinarStatus, string> = {
  draft: 'Черновик',
  planned: 'Запланирован',
  live: 'Идёт',
  completed: 'Завершён',
  cancelled: 'Отменён'
};
