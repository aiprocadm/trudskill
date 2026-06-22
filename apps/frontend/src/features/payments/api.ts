import { apiRequest } from '../../lib/api/client';

import type { CreateOrderInput, MarkPaidInput, Order, PaymentProviderSettings } from './types';

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

export const payOrder = (id: string): Promise<{ confirmationUrl?: string }> =>
  apiRequest<{ confirmationUrl?: string }>(`/orders/${id}/pay`, { method: 'POST' });

export const getPaymentProviderSettings = (): Promise<PaymentProviderSettings> =>
  apiRequest<PaymentProviderSettings>('/payments/provider-settings');

export const savePaymentProviderSettings = (input: {
  providerCode: string;
  enabled: boolean;
}): Promise<PaymentProviderSettings> =>
  apiRequest<PaymentProviderSettings>('/payments/provider-settings', {
    method: 'PUT',
    body: input
  });
