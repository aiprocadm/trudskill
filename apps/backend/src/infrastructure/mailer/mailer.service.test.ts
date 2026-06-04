import { describe, expect, it } from 'vitest';

import { NoopMailer } from './mailer.service.js';

describe('NoopMailer', () => {
  it('does not send and reports skipped_noop', async () => {
    const mailer = new NoopMailer();
    const result = await mailer.send({
      to: 'learner@example.com',
      subject: 'S',
      body: 'B',
      templateKey: 'enrollment_invite'
    });
    expect(result.status).toBe('skipped_noop');
    expect(result.providerMessageId).toBeUndefined();
  });
});
