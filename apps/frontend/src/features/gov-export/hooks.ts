'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { govExportApi } from './api';
import { useAuth } from '../auth/context';

import type { FrdoRegistryBatch, OtRegistryBatch } from './types';

/**
 * Fetch the OT-registry training programs classifier (Минтруд/ЕИСОТ).
 * Mirrors useRegulatoryActs — returns { data: T | null, loading, error, refetch }.
 */
export const useOtTrainingPrograms = () => {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['govExport', 'otTrainingPrograms'],
    enabled: Boolean(session),
    queryFn: () => govExportApi.listOtTrainingPrograms(session!)
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};

/**
 * Fetch the list of OT-registry export batches.
 * Mirrors useExportTasks / useIntegrationList — returns { data: T[], loading, error, refetch }.
 */
export const useOtRegistryBatches = (live = false) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['govExport', 'otRegistryBatches'],
    enabled: Boolean(session),
    queryFn: async (): Promise<OtRegistryBatch[]> => {
      const result = await govExportApi.listBatches(session!);
      return result;
    },
    refetchInterval: live ? 15_000 : undefined
  });

  useEffect(() => {
    if (!session) {
      void queryClient.invalidateQueries({ queryKey: ['govExport'] });
    }
  }, [queryClient, session]);

  return {
    data: query.data ?? ([] as OtRegistryBatch[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};

/**
 * Fetch the list of ФРДО (Рособрнадзор) export batches. Mirrors useOtRegistryBatches.
 */
export const useFrdoRegistryBatches = (live = false) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['govExport', 'frdoRegistryBatches'],
    enabled: Boolean(session),
    queryFn: (): Promise<FrdoRegistryBatch[]> => govExportApi.listFrdoBatches(session!),
    refetchInterval: live ? 15_000 : undefined
  });

  useEffect(() => {
    if (!session) {
      void queryClient.invalidateQueries({ queryKey: ['govExport'] });
    }
  }, [queryClient, session]);

  return {
    data: query.data ?? ([] as FrdoRegistryBatch[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};
