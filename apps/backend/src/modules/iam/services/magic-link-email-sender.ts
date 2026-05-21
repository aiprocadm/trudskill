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
    const url = buildMagicLinkUrl(input.rawToken);
    this.logger.log(`magic_link.delivery to=${input.email} url=${url} (Phase 1: log-only)`);
  }
}
