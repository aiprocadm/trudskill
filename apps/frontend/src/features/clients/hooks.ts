'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { clientsApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type {
  ClientListItem,
  ClientsListFilters,
  CreateClientPayload,
  UpdateClientPayload
} from './types';

export function useClientsList(filters: ClientsListFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['clients-list', filters],
    enabled: Boolean(session),
    queryFn: () => clientsApi.list(session!, filters)
  });
}

export function useClient(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['client-detail', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => clientsApi.get(session!, id!)
  });
}

export function useClientProgress(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['client-progress', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => clientsApi.getProgressSummary(session!, id!)
  });
}

export function useGroupProgress(groupId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['group-progress', groupId],
    enabled: Boolean(session) && Boolean(groupId),
    queryFn: () => clientsApi.getGroupProgressSummary(session!, groupId!)
  });
}

export interface ClientMutationState {
  isPending: boolean;
  error: string | null;
  data: ClientListItem | null;
}

const INITIAL_STATE: ClientMutationState = { isPending: false, error: null, data: null };

export function useCreateClient() {
  const { session } = useAuth();
  const [state, setState] = useState<ClientMutationState>(INITIAL_STATE);

  const mutate = async (payload: CreateClientPayload): Promise<ClientListItem | null> => {
    if (!session) {
      setState({ isPending: false, error: 'Нет активной сессии', data: null });
      return null;
    }
    setState({ isPending: true, error: null, data: null });
    try {
      const result = await clientsApi.create(session, payload);
      setState({ isPending: false, error: null, data: result });
      return result;
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Не удалось создать компанию';
      setState({ isPending: false, error: message, data: null });
      return null;
    }
  };

  return { ...state, mutate, reset: () => setState(INITIAL_STATE) };
}

export function useUpdateClientProfile() {
  const { session } = useAuth();
  const [state, setState] = useState<ClientMutationState>(INITIAL_STATE);

  const mutate = async (
    id: string,
    payload: UpdateClientPayload
  ): Promise<ClientListItem | null> => {
    if (!session) {
      setState({ isPending: false, error: 'Нет активной сессии', data: null });
      return null;
    }
    setState({ isPending: true, error: null, data: null });
    try {
      const result = await clientsApi.updateProfile(session, id, payload);
      setState({ isPending: false, error: null, data: result });
      return result;
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Не удалось сохранить данные';
      setState({ isPending: false, error: message, data: null });
      return null;
    }
  };

  return { ...state, mutate, reset: () => setState(INITIAL_STATE) };
}

export interface GroupCounterpartyMutationState {
  isPending: boolean;
  error: string | null;
}

export function useSetGroupCounterparty() {
  const { session } = useAuth();
  const [state, setState] = useState<GroupCounterpartyMutationState>({
    isPending: false,
    error: null
  });

  const mutate = async (groupId: string, counterpartyId: string | null): Promise<boolean> => {
    if (!session) {
      setState({ isPending: false, error: 'Нет активной сессии' });
      return false;
    }
    setState({ isPending: true, error: null });
    try {
      await clientsApi.setGroupCounterparty(session, groupId, counterpartyId);
      setState({ isPending: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Не удалось обновить связь';
      setState({ isPending: false, error: message });
      return false;
    }
  };

  return { ...state, mutate, reset: () => setState({ isPending: false, error: null }) };
}
