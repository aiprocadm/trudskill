import { describe, expect, it, vi } from 'vitest';

import { CounterpartyPeopleService } from './counterparty-people.service.js';
import { CounterpartyRepresentativeService } from './counterparty-representative.service.js';
import { InMemoryCounterpartyPeopleRepository } from './in-memory-counterparty-people.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { Counterparty } from '../mvp.types.js';

const T = 'tenant_demo';
const NOW = '2026-09-24T10:00:00.000Z';

const company = (id: string): Counterparty => ({
  id,
  tenantId: T,
  code: id.toUpperCase(),
  name: id,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW
});

const ctx: RequestContext = {
  requestId: 'req',
  correlationId: 'corr',
  tenantId: T,
  userId: 'u_curator'
};

async function makeInvite(options: {
  roles?: Record<string, string[]>;
  linkedTo?: Record<string, string>;
  rawToken?: string | null;
}) {
  const state = new InMemoryMvpState();
  state.counterparties.push(company('cp_a'), company('cp_b'));
  const repo = new InMemoryCounterpartyPeopleRepository();
  const audit = new AuditService();
  const people = new CounterpartyPeopleService(state, repo, audit);
  const roles = { ...(options.roles ?? {}) };
  const linkedTo = { ...(options.linkedTo ?? {}) };
  const iam = {
    findOrCreateByEmail: vi.fn(async (_t: string, email: string) => ({
      user: { id: `u:${email}` }
    })),
    getUserRoles: vi.fn(async (_t: string, userId: string) =>
      (roles[userId] ?? []).map((code) => ({ code }))
    ),
    getUser: vi.fn(async (_t: string, userId: string) => ({
      id: userId,
      counterpartyId: linkedTo[userId] ?? null
    })),
    linkRepresentative: vi.fn(async (_t: string, userId: string, counterpartyId: string) => {
      linkedTo[userId] = counterpartyId;
      roles[userId] = [...(roles[userId] ?? []), 'counterparty_rep'];
    })
  };
  const magicLinks = {
    requestLink: vi.fn(async () => ({
      rawToken: options.rawToken === undefined ? 'tok' : options.rawToken
    }))
  };
  const sender = { sendMagicLink: vi.fn(async () => undefined) };
  const service = new CounterpartyRepresentativeService(
    people,
    repo,
    iam as never,
    magicLinks as never,
    sender as never,
    audit
  );
  const hr = await people.createContact(
    T,
    'cp_a',
    { firstName: 'Анна', lastName: 'Петрова', email: 'HR@Romashka.ru' },
    ctx
  );
  return { service, people, repo, audit, iam, magicLinks, sender, hr, roles, linkedTo };
}

describe('«Пригласить в портал» (МГ-D2.1, срез 14.3)', () => {
  it('контакт с почтой: учётка, привязка к компании и роль одной операцией, письмо входа, аудит', async () => {
    const { service, iam, sender, hr, audit, repo } = await makeInvite({});
    const outcome = await service.invite(T, 'cp_a', hr.id, ctx);

    expect(iam.findOrCreateByEmail).toHaveBeenCalledWith(T, 'hr@romashka.ru');
    expect(iam.linkRepresentative).toHaveBeenCalledWith(T, 'u:hr@romashka.ru', 'cp_a');
    expect(outcome).toMatchObject({ status: 'sent', userId: 'u:hr@romashka.ru' });
    expect(sender.sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'hr@romashka.ru', rawToken: 'tok' })
    );
    expect((await repo.getContact(T, 'cp_a', hr.id))?.userId).toBe('u:hr@romashka.ru');
    const record = (await audit.list(T)).find(
      (e) => e.action === 'crm.counterparty_contact_invited'
    );
    expect(record?.newValues).toEqual({
      counterpartyId: 'cp_a',
      status: 'sent',
      userId: 'u:hr@romashka.ru'
    });
  });

  it('сотрудник центра и человек другой компании — отказ без привязки', async () => {
    const staff = await makeInvite({ roles: { 'u:hr@romashka.ru': ['curator'] } });
    await expect(staff.service.invite(T, 'cp_a', staff.hr.id, ctx)).rejects.toMatchObject({
      status: 409,
      response: { code: 'contact_user_is_staff' }
    });
    expect(staff.iam.linkRepresentative).not.toHaveBeenCalled();

    const other = await makeInvite({
      roles: { 'u:hr@romashka.ru': ['counterparty_rep'] },
      linkedTo: { 'u:hr@romashka.ru': 'cp_b' }
    });
    await expect(other.service.invite(T, 'cp_a', other.hr.id, ctx)).rejects.toMatchObject({
      status: 409,
      response: { code: 'contact_user_other_company' }
    });
    expect(other.iam.linkRepresentative).not.toHaveBeenCalled();
  });

  it('слушатель той же почты становится и представителем; представитель без привязки — привязывается', async () => {
    const learner = await makeInvite({ roles: { 'u:hr@romashka.ru': ['learner'] } });
    await expect(learner.service.invite(T, 'cp_a', learner.hr.id, ctx)).resolves.toMatchObject({
      status: 'sent'
    });
    const unlinked = await makeInvite({ roles: { 'u:hr@romashka.ru': ['counterparty_rep'] } });
    await unlinked.service.invite(T, 'cp_a', unlinked.hr.id, ctx);
    expect(unlinked.linkedTo['u:hr@romashka.ru']).toBe('cp_a');
  });

  it('без почты или в архиве — понятный отказ; недавно уже слали — «throttled» без письма', async () => {
    const env = await makeInvite({ rawToken: null });
    const noEmail = await env.people.createContact(T, 'cp_a', { firstName: 'Олег' }, ctx);
    await expect(env.service.invite(T, 'cp_a', noEmail.id, ctx)).rejects.toMatchObject({
      response: { code: 'contact_no_email' }
    });
    const archived = await env.people.createContact(
      T,
      'cp_a',
      { firstName: 'Ирина', email: 'i@romashka.ru' },
      ctx
    );
    await env.people.updateContact(T, 'cp_a', archived.id, { status: 'archived' }, ctx);
    await expect(env.service.invite(T, 'cp_a', archived.id, ctx)).rejects.toMatchObject({
      response: { code: 'contact_archived' }
    });
    await expect(env.service.invite(T, 'cp_a', env.hr.id, ctx)).resolves.toMatchObject({
      status: 'throttled'
    });
    expect(env.sender.sendMagicLink).not.toHaveBeenCalled();
  });

  it('представитель чужой компании приглашать в неё не может — «не найдено»', async () => {
    const env = await makeInvite({});
    await expect(
      env.service.invite(T, 'cp_a', env.hr.id, { ...ctx, counterpartyId: 'cp_b' })
    ).rejects.toMatchObject({ status: 404 });
  });
});
