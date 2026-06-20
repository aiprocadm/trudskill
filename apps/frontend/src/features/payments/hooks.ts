'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { cancelOrder, createOrder, listMyOrders, listOrders, markOrderPaid } from './api';

import type { CreateOrderInput, MarkPaidInput, Order } from './types';

export function useMyOrders() {
  const query = useQuery<Order[]>({
    queryKey: ['payments', 'my-orders'],
    queryFn: () => listMyOrders()
  });

  return {
    data: query.data ?? ([] as Order[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
}

export function useOrders(status?: string) {
  const query = useQuery<Order[]>({
    queryKey: ['payments', 'orders', status ?? 'all'],
    queryFn: () => listOrders(status)
  });

  return {
    data: query.data ?? ([] as Order[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
}

export function useOrderMutations() {
  const queryClient = useQueryClient();
  const [markPaidPending, setMarkPaidPending] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [createPending, setCreatePending] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payments', 'orders'] });

  return {
    markPaidPending,
    cancelPending,
    createPending,
    markPaid: async (id: string, input: MarkPaidInput): Promise<Order> => {
      setMarkPaidPending(true);
      try {
        const result = await markOrderPaid(id, input);
        await invalidate();
        return result;
      } finally {
        setMarkPaidPending(false);
      }
    },
    cancel: async (id: string): Promise<Order> => {
      setCancelPending(true);
      try {
        const result = await cancelOrder(id);
        await invalidate();
        return result;
      } finally {
        setCancelPending(false);
      }
    },
    create: async (input: CreateOrderInput): Promise<Order> => {
      setCreatePending(true);
      try {
        const result = await createOrder(input);
        await invalidate();
        return result;
      } finally {
        setCreatePending(false);
      }
    }
  };
}
