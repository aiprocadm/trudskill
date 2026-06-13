'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { reportBuilderApi } from './api';
import { useAuth } from '../auth/context';

import type {
  BuildReportRequest,
  ReportEntitiesMeta,
  ReportExport,
  ReportPreview,
  ReportTemplate,
  SaveReportTemplateRequest
} from './types';

export function useReportEntities() {
  const { session } = useAuth();
  return useQuery<ReportEntitiesMeta>({
    queryKey: ['report-builder-entities'],
    enabled: Boolean(session),
    queryFn: () => reportBuilderApi.entities(session!)
  });
}

export function useReportTemplates() {
  const { session } = useAuth();
  return useQuery<ReportTemplate[]>({
    queryKey: ['report-builder-templates'],
    enabled: Boolean(session),
    queryFn: () => reportBuilderApi.listTemplates(session!)
  });
}

/**
 * Manual async wrappers (no useMutation) — the project's convention
 * (see useRecertificationMutations / useDomainMutations). Templates list is
 * invalidated after save/delete.
 */
export function useReportBuilderMutations() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [previewPending, setPreviewPending] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [savePending, setSavePending] = useState(false);

  const invalidateTemplates = () =>
    queryClient.invalidateQueries({ queryKey: ['report-builder-templates'] });

  return {
    previewPending,
    exportPending,
    savePending,
    preview: async (req: BuildReportRequest): Promise<ReportPreview> => {
      if (!session) throw new Error('Нет активной сессии');
      setPreviewPending(true);
      try {
        return await reportBuilderApi.preview(session, req);
      } finally {
        setPreviewPending(false);
      }
    },
    exportReport: async (req: BuildReportRequest): Promise<ReportExport> => {
      if (!session) throw new Error('Нет активной сессии');
      setExportPending(true);
      try {
        return await reportBuilderApi.export(session, req);
      } finally {
        setExportPending(false);
      }
    },
    saveTemplate: async (req: SaveReportTemplateRequest): Promise<ReportTemplate> => {
      if (!session) throw new Error('Нет активной сессии');
      setSavePending(true);
      try {
        const result = await reportBuilderApi.saveTemplate(session, req);
        await invalidateTemplates();
        return result;
      } finally {
        setSavePending(false);
      }
    },
    deleteTemplate: async (id: string): Promise<void> => {
      if (!session) throw new Error('Нет активной сессии');
      await reportBuilderApi.deleteTemplate(session, id);
      await invalidateTemplates();
    }
  };
}
