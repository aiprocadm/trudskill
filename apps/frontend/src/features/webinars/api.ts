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

export const getProviderSettings = (): Promise<ProviderSettings> =>
  apiRequest<ProviderSettings>('/webinars/provider-settings');

export const saveProviderSettings = (input: ProviderSettings): Promise<ProviderSettings> =>
  apiRequest<ProviderSettings>('/webinars/provider-settings', { method: 'PUT', body: input });
