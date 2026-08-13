'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { documentsApi } from './api';
import { useAuth } from '../auth/context';

/*
 * Запросы вынесены из экрана «как есть» (§8.3, SCR-001). Ключи кэша и условия включения
 * сохранены дословно — иначе перенос перестал бы быть переносом.
 */

export const useDocumentsOverview = () => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['documents', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => documentsApi.overview(session!)
  });
};

export const useTemplateVersions = (templateId: string) => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['template-versions', session?.user.id, templateId],
    enabled: Boolean(session && templateId),
    queryFn: () => documentsApi.versions(session!, templateId)
  });
};

/** Активная версия, а если ни одна не помечена активной — последняя загруженная. */
export const useActiveVersionId = (templateId: string): string | undefined => {
  const versions = useTemplateVersions(templateId);
  return useMemo(() => {
    const items = versions.data?.items ?? [];
    return items.find((item) => item.isActive)?.id ?? items[items.length - 1]?.id;
  }, [versions.data?.items]);
};

export const useTemplateVariables = (templateVersionId: string | undefined) => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['template-variables', session?.user.id, templateVersionId],
    enabled: Boolean(session && templateVersionId),
    queryFn: () => documentsApi.variables(session!, templateVersionId!)
  });
};

export const useTemplateBindings = (templateId: string) => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['template-bindings', session?.user.id, templateId],
    enabled: Boolean(session && templateId),
    queryFn: () => documentsApi.bindings(session!, templateId)
  });
};
