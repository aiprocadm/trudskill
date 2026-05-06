import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../env.js', () => ({
  backendEnv: {
    JOB_EXCHANGE: 'jobs.test.exchange',
    JOB_ROUTING_BULK_ENROLLMENT: 'lms.bulk_enrollment.test'
  }
}));

import { MvpBulkEnqueueService } from './mvp-bulk-enqueue.service.js';

import type { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';

describe('MvpBulkEnqueueService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('publishBulkJob publishes envelope with correlation and payload fields', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const rabbit = { publish } as unknown as RabbitMqService;
    const svc = new MvpBulkEnqueueService(rabbit);

    const result = await svc.publishBulkJob(
      'tenant_alpha',
      'actor_1',
      {
        idempotencyKey: 'idem-xyz',
        groupId: 'group_course_1',
        learnerIds: ['learner_a', 'learner_b']
      },
      'req-http-1',
      'corr-trace-1'
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      'jobs.test.exchange',
      'lms.bulk_enrollment.test',
      expect.objectContaining({
        tenantId: 'tenant_alpha',
        jobType: 'bulk_enrollment',
        messageId: expect.any(String),
        payload: {
          actorId: 'actor_1',
          idempotencyKey: 'idem-xyz',
          groupId: 'group_course_1',
          learnerIds: ['learner_a', 'learner_b']
        }
      }),
      { requestId: 'req-http-1', correlationId: 'corr-trace-1' }
    );

    expect(result.status).toBe('queued');
    expect(result.idempotencyKey).toBe('idem-xyz');
    expect(result.messageId).toBeTruthy();
  });

  it('publishBulkJob includes organizationUnitId in payload when set', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const svc = new MvpBulkEnqueueService({ publish } as unknown as RabbitMqService);

    await svc.publishBulkJob(
      'tenant_alpha',
      undefined,
      {
        idempotencyKey: 'idem-ou',
        groupId: 'g1',
        organizationUnitId: 'org_unit_hr'
      },
      undefined,
      undefined
    );

    expect(publish).toHaveBeenCalledWith(
      'jobs.test.exchange',
      'lms.bulk_enrollment.test',
      expect.objectContaining({
        payload: expect.objectContaining({
          organizationUnitId: 'org_unit_hr',
          actorId: undefined
        })
      }),
      { requestId: undefined, correlationId: undefined }
    );
  });
});
