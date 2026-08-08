import { apiRequest } from '../../lib/api/client';

import type { CreateWebinarInput, ProviderSettings, Webinar, WebinarParticipant } from './types';

export const listWebinars = (): Promise<{ items: Webinar[]; total: number }> =>
  apiRequest<{ items: Webinar[]; total: number }>('/webinars');

export const createWebinar = (input: CreateWebinarInput): Promise<Webinar> =>
  apiRequest<Webinar>('/webinars', { method: 'POST', body: input });

export const listParticipants = (
  id: string
): Promise<{ items: WebinarParticipant[]; total: number }> =>
  apiRequest<{ items: WebinarParticipant[]; total: number }>(`/webinars/${id}/participants`);

export const listMyWebinars = (): Promise<Webinar[]> => apiRequest<Webinar[]>('/webinars/mine');

/**
 * ФТ-F4 (Фаза 5 Task 9): отметка посещения при подключении. Сервер ставит
 * `joined` (идемпотентно) и возвращает ссылку на комнату — фронт открывает её
 * ПОСЛЕ отметки, чтобы посещение не терялось из-за закрытой вкладки.
 */
export const joinWebinar = (id: string): Promise<{ attendanceStatus: string; joinUrl?: string }> =>
  apiRequest<{ attendanceStatus: string; joinUrl?: string }>(`/webinars/${id}/join`, {
    method: 'POST'
  });

export const getProviderSettings = (): Promise<ProviderSettings> =>
  apiRequest<ProviderSettings>('/webinars/provider-settings');

export const saveProviderSettings = (input: ProviderSettings): Promise<ProviderSettings> =>
  apiRequest<ProviderSettings>('/webinars/provider-settings', { method: 'PUT', body: input });
