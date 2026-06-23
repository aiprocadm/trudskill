import { Injectable, Logger } from '@nestjs/common';

import { backendEnv } from '../../../env.js';

export interface SendMagicLinkInput {
  email: string;
  rawToken: string;
}

export interface MagicLinkEmailSender {
  sendMagicLink(input: SendMagicLinkInput): Promise<void>;
}

export const MAGIC_LINK_EMAIL_SENDER = 'MAGIC_LINK_EMAIL_SENDER';

export function buildMagicLinkUrl(rawToken: string): string {
  const base = backendEnv.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/login/magic-link/${encodeURIComponent(rawToken)}`;
}

@Injectable()
export class LoggingMagicLinkEmailSender implements MagicLinkEmailSender {
  private readonly logger = new Logger(LoggingMagicLinkEmailSender.name);

  async sendMagicLink(input: SendMagicLinkInput): Promise<void> {
    // SECURITY: a magic-link URL embeds a live, single-use, still-redeemable auth token.
    // The dev/staging "log-only" flow deliberately prints it so an operator can copy it,
    // but in production that would leak credentials to stdout/log aggregation where anyone
    // with log access could redeem them. Production MUST deliver via email — so refuse to
    // print the token there and tell the operator how to fix the configuration.
    if (backendEnv.NODE_ENV === 'production') {
      this.logger.warn(
        `magic_link.delivery to=${input.email} url=<redacted in production> — ` +
          'set NOTIFICATIONS_EMAIL_ENABLED=true with SMTP_* to deliver magic links by email'
      );
      return;
    }
    const url = buildMagicLinkUrl(input.rawToken);
    this.logger.log(`magic_link.delivery to=${input.email} url=${url} (Phase 1: log-only)`);
  }
}
