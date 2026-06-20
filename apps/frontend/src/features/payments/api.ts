import { apiRequest } from '../../lib/api/client';

import type { CreateOrderInput, MarkPaidInput, Order } from './types';

export const listOrders = (status?: string): Promise<Order[]> =>
  apiRequest<Order[]>(`/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`);

export const getOrder = (id: string): Promise<Order> => apiRequest<Order>(`/orders/${id}`);

export const createOrder = (input: CreateOrderInput): Promise<Order> =>
  apiRequest<Order>('/orders', { method: 'POST', body: input });

export const markOrderPaid = (id: string, input: MarkPaidInput): Promise<Order> =>
  apiRequest<Order>(`/orders/${id}/mark-paid`, { method: 'POST', body: input });

export const cancelOrder = (id: string): Promise<Order> =>
  apiRequest<Order>(`/orders/${id}/cancel`, { method: 'POST' });

export const listMyOrders = (): Promise<Order[]> => apiRequest<Order[]>('/me/orders');
