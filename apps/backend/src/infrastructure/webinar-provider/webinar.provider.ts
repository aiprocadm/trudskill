/**
 * Provider-agnostic seam for webinars, mirroring the PaymentProvider seam but multi-provider:
 * the active provider is chosen PER TENANT (see WebinarProviderResolver), not by one global env
 * enum. Noop is the safe default for any tenant with no/disabled provider config and for the whole
 * subsystem while WEBINARS_ENABLED=false. Real adapters (Jitsi, etc.) plug into the registry later.
 */
export type WebinarProviderCode = 'noop' | 'fake' | 'jitsi' | 'pruffme' | 'zoom' | 'bbb';

export interface CreateSessionInput {
  tenantId: string;
  webinarId: string;
  title: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface ProviderSession {
  providerSessionId: string;
  joinUrl: string;
  hostUrl: string;
}

export interface WebinarAttendanceEvent {
  providerSessionId: string;
  /** Stable participant key from the provider; matched to user_id or learner_id. */
  participantRef: string;
  type: 'joined' | 'left';
  occurredAt: string;
  durationSeconds?: number;
}

export interface WebinarProvider {
  readonly code: WebinarProviderCode;
  /** Returns null when the provider is asleep/unavailable (webinar still created, fail-soft). */
  createSession(input: CreateSessionInput): Promise<ProviderSession | null>;
  /** Verifies signature internally; returns null for unrecognized/unsigned payloads. */
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebinarAttendanceEvent[] | null>;
}

/** DI token for the registry of all compiled-in providers (Map<code, provider>). */
export const WEBINAR_PROVIDER_REGISTRY = Symbol('WEBINAR_PROVIDER_REGISTRY');
export type WebinarProviderRegistry = Map<WebinarProviderCode, WebinarProvider>;

export class NoopWebinarProvider implements WebinarProvider {
  readonly code = 'noop' as const;
  async createSession(): Promise<ProviderSession | null> {
    return null;
  }
  async parseWebhook(): Promise<WebinarAttendanceEvent[] | null> {
    return null;
  }
}
