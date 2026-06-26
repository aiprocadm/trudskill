import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SetNotificationStaffRecipientsRequest } from './notification-recipients.dto.js';

function errors(plain: unknown) {
  const instance = plainToInstance(SetNotificationStaffRecipientsRequest, plain);
  return validateSync(instance, { whitelist: true, forbidNonWhitelisted: false });
}

describe('SetNotificationStaffRecipientsRequest', () => {
  it('passes for a list of valid e-mails', () => {
    expect(errors({ emails: ['curator@example.ru', 'admin@center.org'] })).toHaveLength(0);
  });

  it('passes for an empty array (disables staff copies)', () => {
    expect(errors({ emails: [] })).toHaveLength(0);
  });

  it('fails when an element is not a valid e-mail', () => {
    const result = errors({ emails: ['curator@example.ru', 'not-an-email'] });
    expect(result.some((e) => e.property === 'emails')).toBe(true);
  });

  it('fails when an element is not a string', () => {
    const result = errors({ emails: ['curator@example.ru', 42] });
    expect(result.some((e) => e.property === 'emails')).toBe(true);
  });

  it('fails when emails is not an array', () => {
    const result = errors({ emails: 'curator@example.ru' });
    expect(result.some((e) => e.property === 'emails')).toBe(true);
  });

  it('fails when the list exceeds the 50-address cap', () => {
    const result = errors({ emails: Array.from({ length: 51 }, (_, i) => `u${i}@example.ru`) });
    expect(result.some((e) => e.property === 'emails')).toBe(true);
  });
});
