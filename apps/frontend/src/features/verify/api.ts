import { frontendEnv } from '../../lib/config/env';

import type { VerifyResult } from './types';

/**
 * Pillar A Plan C §5.8 — fetch public verify endpoint без auth-заголовков.
 * Возвращает null при 404 (документ не найден) — page показывает «Не найден».
 * Throw при network error / 500.
 */
export async function fetchVerifyDocument(token: string): Promise<VerifyResult | null> {
  const url = `${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/public/verify/${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store'
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Verify failed: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { data?: VerifyResult } | VerifyResult;
  // Бэкенд оборачивает в { data, meta } envelope; public endpoint следует тому же.
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data) {
    return payload.data;
  }
  return payload as VerifyResult;
}
