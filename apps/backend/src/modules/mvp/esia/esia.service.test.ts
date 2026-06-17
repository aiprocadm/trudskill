// apps/backend/src/modules/mvp/esia/esia.service.test.ts
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EsiaService } from './esia.service.js';
import { signEsiaState } from '../../../infrastructure/esia/esia-state.js';
import {
  MockEsiaProvider,
  encodeMockCode
} from '../../../infrastructure/esia/mock-esia.provider.js';

const SECRET = 'svc-secret';
const ctx = { tenantId: 't1', requestId: 'r', correlationId: 'c' } as never;

const makeService = (overrides?: { learners?: unknown[] }) => {
  const provider = new MockEsiaProvider();
  const mvp = {
    findLearnersBySnils: vi.fn().mockReturnValue(overrides?.learners ?? []),
    approveIdentityViaEsia: vi
      .fn()
      .mockReturnValue({ id: 'idv_1', verificationStatus: 'approved' }),
    linkLearnerToIamUser: vi.fn()
  };
  const iam = {
    findOrCreateByEmail: vi.fn().mockResolvedValue({ user: { id: 'u1' }, databaseBacked: false })
  };
  const config = {
    secret: SECRET,
    ttlSeconds: 300,
    callbackUrl: 'http://app/cb',
    nowMs: () => 1000
  };
  const service = new EsiaService(provider, mvp as never, iam as never, config);
  return { service, provider, mvp, iam };
};

describe('EsiaService', () => {
  it('login: denies when no learner matches the СНИЛС (no auto-create)', async () => {
    const { service } = makeService({ learners: [] });
    const state = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.resolveLoginUser('t1', code, state)).rejects.toThrow(ForbiddenException);
  });

  it('login: denies when the matched learner has no email (no account to sign into)', async () => {
    const { service, iam } = makeService({ learners: [{ id: 'lrn_1', snils: '11223344595' }] });
    const state = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.resolveLoginUser('t1', code, state)).rejects.toThrow(ForbiddenException);
    expect(iam.findOrCreateByEmail).not.toHaveBeenCalled();
  });

  it('login: resolves + links the IAM user when a learner matches by СНИЛС', async () => {
    const { service, mvp, iam } = makeService({
      learners: [{ id: 'lrn_1', snils: '11223344595', email: 'learner@example.test' }]
    });
    const state = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.resolveLoginUser('t1', code, state)).resolves.toEqual({
      userId: 'u1',
      databaseBacked: false
    });
    expect(iam.findOrCreateByEmail).toHaveBeenCalledWith('t1', 'learner@example.test');
    expect(mvp.linkLearnerToIamUser).toHaveBeenCalledWith('t1', 'lrn_1', 'u1');
  });

  it('identity: rejects when ЕСИА СНИЛС differs from the session learner', async () => {
    // findLearnersBySnils(ЕСИА-snils) returns [] → no learner with that СНИЛС is lrn_1 → mismatch.
    const { service } = makeService({ learners: [] });
    const state = signEsiaState(
      { purpose: 'identity', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.approveIdentity('t1', 'lrn_1', code, state, ctx)).rejects.toThrow(
      UnprocessableEntityException
    );
  });

  it('identity: approves when ЕСИА СНИЛС matches the session learner', async () => {
    const { service } = makeService({ learners: [{ id: 'lrn_1', snils: '11223344595' }] });
    const state = signEsiaState(
      { purpose: 'identity', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.approveIdentity('t1', 'lrn_1', code, state, ctx)).resolves.toEqual({
      verificationId: 'idv_1'
    });
  });
});
