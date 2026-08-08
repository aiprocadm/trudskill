import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  createWebinar as CreateWebinar,
  listWebinars as ListWebinars,
  saveProviderSettings as SaveProviderSettings
} from './api';

const fetchMock = vi.fn();
const envelope = <T>(data: T) =>
  JSON.stringify({ data, meta: { requestId: 'r', correlationId: 'c', timestamp: 't' } });

describe('webinars api', () => {
  let listWebinars: typeof ListWebinars;
  let createWebinar: typeof CreateWebinar;
  let saveProviderSettings: typeof SaveProviderSettings;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    listWebinars = mod.listWebinars;
    createWebinar = mod.createWebinar;
    saveProviderSettings = mod.saveProviderSettings;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('listWebinars unwraps the envelope { items }', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({ items: [{ id: 'w1', title: 'Intro', status: 'planned' }], total: 1 }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await listWebinars();
    expect(res.items[0]?.id).toBe('w1');
  });

  it('createWebinar posts to /webinars', async () => {
    const spy = vi.fn(
      async () =>
        new Response(envelope({ id: 'w2', title: 'X', status: 'planned' }), { status: 200 })
    );
    vi.stubGlobal('fetch', spy);
    await createWebinar({ title: 'X', plannedStartAt: 'a', plannedEndAt: 'b' });
    expect((spy.mock.calls[0] as unknown as [string])[0]).toContain('/webinars');
  });

  it('saveProviderSettings PUTs to /webinars/provider-settings', async () => {
    const spy = vi.fn(
      async () => new Response(envelope({ providerCode: 'jitsi', enabled: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', spy);
    await saveProviderSettings({ providerCode: 'jitsi', enabled: true });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/webinars/provider-settings');
    expect(init.method).toBe('PUT');
  });

  it('ФТ-F4: joinWebinar отмечает посещение POST-ом и возвращает ссылку на комнату', async () => {
    const mod = await import('./api');
    const spy = vi.fn().mockResolvedValueOnce(
      new Response(envelope({ attendanceStatus: 'joined', joinUrl: 'https://join/room' }), {
        status: 201
      })
    );
    vi.stubGlobal('fetch', spy);
    const res = await mod.joinWebinar('w1');
    expect(res.attendanceStatus).toBe('joined');
    expect(res.joinUrl).toBe('https://join/room');
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/webinars/w1/join');
    expect(init.method).toBe('POST');
  });
});
