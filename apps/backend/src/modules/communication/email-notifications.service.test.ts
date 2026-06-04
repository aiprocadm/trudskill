import { describe, expect, it } from 'vitest';

import { EMAIL_TEMPLATE_DEFAULTS, renderTemplate } from './email-templates.js';
import { InMemoryEmailTemplatesState } from './in-memory-email-templates.state.js';

describe('email templates', () => {
  it('has a default for every template key', () => {
    expect(EMAIL_TEMPLATE_DEFAULTS.enrollment_invite.subject.length).toBeGreaterThan(0);
    expect(EMAIL_TEMPLATE_DEFAULTS.course_completed.subject.length).toBeGreaterThan(0);
  });

  it('interpolates {{variables}} into subject and body', () => {
    const rendered = renderTemplate(
      { subject: 'Курс {{courseTitle}}', body: 'Здравствуйте, {{learnerName}}!' },
      { courseTitle: 'Охрана труда', learnerName: 'Иванов И.' }
    );
    expect(rendered.subject).toBe('Курс Охрана труда');
    expect(rendered.body).toBe('Здравствуйте, Иванов И.!');
  });

  it('replaces an unknown placeholder with an empty string', () => {
    const rendered = renderTemplate({ subject: 'A {{missing}}', body: 'B' }, {});
    expect(rendered.subject).toBe('A ');
  });
});

describe('email templates repository (in-memory)', () => {
  it('upserts and reads back an override, scoped by tenant', async () => {
    const repo = new InMemoryEmailTemplatesState();
    await repo.upsertOverride('t1', 'enrollment_invite', {
      subject: 'Custom',
      body: 'Body',
      updatedBy: 'u1'
    });
    const found = await repo.getOverride('t1', 'enrollment_invite');
    expect(found?.subject).toBe('Custom');
    expect(await repo.getOverride('t2', 'enrollment_invite')).toBeNull();
  });

  it('upsert replaces an existing override rather than duplicating', async () => {
    const repo = new InMemoryEmailTemplatesState();
    await repo.upsertOverride('t1', 'course_completed', { subject: 'A', body: 'a' });
    await repo.upsertOverride('t1', 'course_completed', { subject: 'B', body: 'b' });
    const list = await repo.listOverrides('t1');
    expect(list).toHaveLength(1);
    expect(list[0]!.subject).toBe('B');
  });
});
