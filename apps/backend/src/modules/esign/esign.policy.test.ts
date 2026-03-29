import { describe, expect, it } from 'vitest';
import { EsignStateMachine } from './esign.policy.js';

describe('EsignStateMachine', () => {
  it('allows approved application reuse only', () => {
    expect(() => EsignStateMachine.assertApplicationReusable('approved')).not.toThrow();
    expect(() => EsignStateMachine.assertApplicationReusable('rejected')).toThrow();
  });

  it('blocks invalid backward transition', () => {
    expect(() => EsignStateMachine.transitionApplication('draft', 'approved')).toThrow();
  });

  it('enforces signed_at for signed participant', () => {
    expect(() => EsignStateMachine.assertSignedHasSignedAt('signed')).toThrow();
    expect(() => EsignStateMachine.assertSignedHasSignedAt('signed', new Date().toISOString())).not.toThrow();
  });
});
