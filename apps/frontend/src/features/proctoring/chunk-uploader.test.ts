/**
 * Phase 4 Plan B holistic-review fix C1: a failed presigned PUT must be retried against the
 * SAME registered intent. Requesting a new intent for an already-registered sequence gets a
 * 409 `proctoring_chunk_duplicate` from the backend — the recorder's single retry could then
 * never succeed and a phantom chunk (registered, no object) stayed in the recording.
 *
 * Convention: stub global fetch (see api.contract.test.ts) — no React, no browser.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { makeChunkUploader as MakeChunkUploader } from './hooks';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: 'learner@example.com',
    displayName: 'Learner',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['learner'],
  permissions: ['proctoring.submit']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

/** Routes intent POSTs (numbered presigned URLs) and PUTs (scripted statuses) apart. */
function routeFetch(putStatuses: number[]) {
  const intentUrls: string[] = [];
  const intentBodies: Array<Record<string, unknown>> = [];
  const putCalls: string[] = [];
  fetchMock.mockImplementation((url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (target.includes('/chunk-upload-intent')) {
      intentBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const uploadUrl = `https://minio.example.com/upload-${intentUrls.length + 1}`;
      intentUrls.push(uploadUrl);
      return Promise.resolve(
        new Response(
          envelope({
            fileId: `file_${intentUrls.length}`,
            uploadUrl,
            storageKey: `proctoring/t/${intentUrls.length}.webm`,
            expiresInSeconds: 900
          }),
          { status: 201 }
        )
      );
    }
    putCalls.push(target);
    const status = putStatuses.shift() ?? 200;
    return Promise.resolve(new Response('', { status }));
  });
  return { intentUrls, intentBodies, putCalls };
}

describe('makeChunkUploader — presigned intent reuse on retry (fix C1)', () => {
  let makeChunkUploader: typeof MakeChunkUploader;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    makeChunkUploader = (await import('./hooks')).makeChunkUploader;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('retry for the same sequence does NOT request a second intent and PUTs to the same URL', async () => {
    const { intentUrls, putCalls } = routeFetch([500]); // first PUT fails, second succeeds
    const upload = makeChunkUploader(session, 'prec_1');
    const blob = new Blob(['chunk-bytes'], { type: 'video/webm;codecs=vp8,opus' });

    await expect(upload(0, blob)).rejects.toThrow(/HTTP 500/);
    await expect(upload(0, blob)).resolves.toBeUndefined();

    expect(intentUrls).toHaveLength(1);
    expect(putCalls).toEqual([intentUrls[0], intentUrls[0]]);
  });

  it('distinct sequences get distinct intents', async () => {
    const { intentUrls, intentBodies, putCalls } = routeFetch([]);
    const upload = makeChunkUploader(session, 'prec_1');
    const blob = new Blob(['chunk-bytes'], { type: 'video/webm' });

    await upload(0, blob);
    await upload(1, blob);

    expect(intentUrls).toHaveLength(2);
    expect(intentBodies.map((b) => b.sequence)).toEqual([0, 1]);
    expect(putCalls).toEqual([intentUrls[0], intentUrls[1]]);
  });

  it('a successful PUT clears the cache entry — a later call for the same sequence requests a new intent', async () => {
    const { intentUrls, putCalls } = routeFetch([]);
    const upload = makeChunkUploader(session, 'prec_1');
    const blob = new Blob(['chunk-bytes'], { type: 'video/webm' });

    await upload(0, blob);
    await upload(0, blob); // recorder never does this, but the cache must not poison new uploads

    expect(intentUrls).toHaveLength(2);
    expect(putCalls).toEqual([intentUrls[0], intentUrls[1]]);
  });

  it('a failed intent request caches nothing — the retry re-requests the intent', async () => {
    let intentAttempts = 0;
    const putCalls: string[] = [];
    fetchMock.mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.includes('/chunk-upload-intent')) {
        intentAttempts += 1;
        if (intentAttempts === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: { code: 'internal', message: 'boom' }, meta: {} }),
              { status: 500 }
            )
          );
        }
        return Promise.resolve(
          new Response(
            envelope({
              fileId: 'file_1',
              uploadUrl: 'https://minio.example.com/upload-after-retry',
              storageKey: 'proctoring/t/1.webm',
              expiresInSeconds: 900
            }),
            { status: 201 }
          )
        );
      }
      putCalls.push(target);
      return Promise.resolve(new Response('', { status: 200 }));
    });
    const upload = makeChunkUploader(session, 'prec_1');
    const blob = new Blob(['chunk-bytes'], { type: 'video/webm' });

    await expect(upload(0, blob)).rejects.toThrow();
    await expect(upload(0, blob)).resolves.toBeUndefined();

    expect(intentAttempts).toBe(2);
    expect(putCalls).toEqual(['https://minio.example.com/upload-after-retry']);
  });
});
