import type {
  CreateSessionInput,
  ProviderSession,
  WebinarAttendanceEvent,
  WebinarProvider
} from './webinar.provider.js';

/**
 * Skeleton for a SELF-HOSTED Jitsi Meet adapter — the «собственное решение». Activation follow-up
 * implements: room name derivation, moderator/attendee JWT (app id + secret), and webhook signature
 * verification (Jitsi/Prosody events). Until then it returns null so the registry can list it
 * without presenting a non-functional meeting. baseUrl comes from per-tenant settings; the JWT
 * secret will come from a secret-ref (NOT the settings table) at activation time.
 */
export class JitsiWebinarProvider implements WebinarProvider {
  readonly code = 'jitsi' as const;
  constructor(private readonly baseUrl: string) {}

  async createSession(_input: CreateSessionInput): Promise<ProviderSession | null> {
    console.warn(
      `[webinars] JitsiWebinarProvider is a skeleton (baseUrl=${this.baseUrl}); no room created — implement the real adapter to activate`
    );
    return null;
  }

  async parseWebhook(): Promise<WebinarAttendanceEvent[] | null> {
    return null;
  }
}
