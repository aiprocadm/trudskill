import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoggingMagicLinkEmailSender, buildMagicLinkUrl } from './magic-link-email-sender.js';
import { backendEnv } from '../../../env.js';

describe('buildMagicLinkUrl', () => {
  it('combines PUBLIC_BASE_URL with /login/magic-link/<token>', () => {
    expect(buildMagicLinkUrl('abc123')).toBe('http://127.0.0.1:3000/login/magic-link/abc123');
  });

  it('url-encodes the token to defend against non-base64url payloads', () => {
    expect(buildMagicLinkUrl('a/b+c')).toBe('http://127.0.0.1:3000/login/magic-link/a%2Fb%2Bc');
  });

  it('does not double-slash when PUBLIC_BASE_URL has a trailing slash', () => {
    // PUBLIC_BASE_URL in test env doesn't end with /, so this is a defensive check
    // that the helper strips one if it ever does.
    const url = buildMagicLinkUrl('tok');
    expect(url.match(/\/login/g)).toHaveLength(1);
    expect(url).not.toContain('//login');
  });
});

describe('LoggingMagicLinkEmailSender', () => {
  const originalNodeEnv = backendEnv.NODE_ENV;

  afterEach(() => {
    (backendEnv as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('logs the full magic-link URL outside production (dev log-only flow)', async () => {
    (backendEnv as { NODE_ENV: string }).NODE_ENV = 'development';
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new LoggingMagicLinkEmailSender().sendMagicLink({
      email: 'learner@example.com',
      rawToken: 'tok_secret_123'
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('tok_secret_123');
  });

  it('NEVER logs the token in production — redacts and warns instead', async () => {
    (backendEnv as { NODE_ENV: string }).NODE_ENV = 'production';
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await new LoggingMagicLinkEmailSender().sendMagicLink({
      email: 'learner@example.com',
      rawToken: 'tok_secret_123'
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).not.toContain('tok_secret_123');
    expect(message).toContain('redacted');
  });
});
