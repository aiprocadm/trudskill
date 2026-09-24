'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type CreateSavedViewPayload, type SavedViewDto, savedViewsApi } from './api';
import { useAuth } from '../auth/context';

import type { SavedView } from '@trudskill/ui';

export const SAVED_VIEWS_QUERY_KEY = 'saved-views';

/** Представление сервера → карточка быстрого отбора экрана. */
export const toSavedView = (dto: SavedViewDto): SavedView => ({
  id: dto.id,
  label: dto.scope === 'tenant' ? `${dto.name} · общее` : dto.name,
  query: dto.filters
});

/** Свои и общие представления реестра (МГ-H4.1): один запрос на экран, без тоста при отказе. */
export function useSavedViews(entity: string) {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: [SAVED_VIEWS_QUERY_KEY, session?.user.tenantId, entity],
    enabled: Boolean(session),
    queryFn: () => savedViewsApi.list(session!, entity),
    meta: { suppressGlobalErrorToast: true }
  });
  const dtos = query.data ?? [];
  return {
    views: dtos.map(toSavedView),
    dtos,
    isLoading: query.isLoading,
    error: query.error
  };
}

/** Сохранение и удаление — тот же приём `useState` + `await`, что у остальных настроек. */
export function useSavedViewsMutations(entity: string) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [SAVED_VIEWS_QUERY_KEY] });

  return {
    saving,
    save: async (payload: Omit<CreateSavedViewPayload, 'entity'>): Promise<SavedViewDto> => {
      if (!session) throw new Error('Нет активной сессии');
      setSaving(true);
      try {
        const created = await savedViewsApi.create(session, { ...payload, entity });
        await invalidate();
        return created;
      } finally {
        setSaving(false);
      }
    },
    remove: async (dto: SavedViewDto): Promise<void> => {
      if (!session) throw new Error('Нет активной сессии');
      setSaving(true);
      try {
        await savedViewsApi.remove(session, dto.id, dto.scope === 'tenant');
        await invalidate();
      } finally {
        setSaving(false);
      }
    }
  };
}
