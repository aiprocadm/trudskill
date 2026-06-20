import type {
  CreateSessionInput,
  ProviderSession,
  WebinarAttendanceEvent,
  WebinarProvider
} from './webinar.provider.js';

/**
 * STAGING-ONLY webinar provider. Produces synthetic join/host URLs and accepts a synthetic
 * attendance webhook WITHOUT any real conferencing, so dev/staging can exercise
 * create → join → webhook → attendance end-to-end. FORBIDDEN in production by the resolver
 * (WebinarProviderResolver): prod must never present a fake meeting as real. URLs are
 * self-marked `fake-webinar://` so they are obviously not a real meeting.
 */
export class FakeWebinarProvider implements WebinarProvider {
  readonly code = 'fake' as const;

  async createSession(input: CreateSessionInput): Promise<ProviderSession | null> {
    return {
      providerSessionId: `fake-webinar:${input.webinarId}`,
      joinUrl: `fake-webinar://staging/join/${input.webinarId}`,
      hostUrl: `fake-webinar://staging/host/${input.webinarId}`
    };
  }

  async parseWebhook(raw: Buffer): Promise<WebinarAttendanceEvent[] | null> {
    try {
      const body = JSON.parse(raw.toString('utf8')) as {
        providerSessionId?: unknown;
        events?: unknown;
      };
      if (typeof body.providerSessionId !== 'string' || !Array.isArray(body.events)) return null;
      const out: WebinarAttendanceEvent[] = [];
      for (const e of body.events as Record<string, unknown>[]) {
        if (
          typeof e.participantRef !== 'string' ||
          (e.type !== 'joined' && e.type !== 'left') ||
          typeof e.occurredAt !== 'string'
        ) {
          return null;
        }
        out.push({
          providerSessionId: body.providerSessionId,
          participantRef: e.participantRef,
          type: e.type,
          occurredAt: e.occurredAt,
          ...(typeof e.durationSeconds === 'number' ? { durationSeconds: e.durationSeconds } : {})
        });
      }
      return out;
    } catch {
      return null;
    }
  }
}
