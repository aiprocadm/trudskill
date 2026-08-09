import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { EmailResendService } from './email-resend.service.js';
import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Повторная отправка письма (ФТ-I2, Фаза 6 Task 8).
 *
 * Журнал писем был, а починить «письмо не ушло» — нечем: ручки повтора не существовало.
 * Администратор видел строку `failed` и мог только позвонить разработчику, а слушатель
 * просто не получал приглашение.
 */
const CTX = {
  tenantId: 'tenant_a',
  userId: 'u_admin',
  requestId: 'req_1',
  correlationId: 'corr_1'
} as RequestContext;

const makeService = async (
  over: Partial<{ body: string; tenantId: string; status: string }> = {},
  mailerBehaviour: 'ok' | 'fail' | 'throw' = 'ok'
) => {
  const deliveries = new InMemoryEmailDeliveriesState();
  const sent: Array<{ to: string; subject: string; body: string }> = [];
  const audited: Array<{ action: string; metadata?: Record<string, unknown> }> = [];

  const original = await deliveries.record({
    tenantId: over.tenantId ?? 'tenant_a',
    templateKey: 'enrollment_created',
    recipientEmail: 'learner@example.com',
    recipientKind: 'learner',
    subject: 'Вы зачислены на курс',
    status: (over.status ?? 'failed') as never,
    dedupKey: 'enrollment:e1:created',
    ...(over.body === undefined ? { body: 'Здравствуйте! Вы зачислены.' } : {}),
    ...(over.body ? { body: over.body } : {})
  });

  const mailer = {
    send: async (message: { to: string; subject: string; body: string }) => {
      if (mailerBehaviour === 'throw') throw new Error('smtp down');
      sent.push(message);
      return mailerBehaviour === 'fail'
        ? { status: 'failed' as const, error: 'mailbox full' }
        : { status: 'sent' as const, providerMessageId: 'prov_1' };
    }
  };
  const audit = {
    write: (entry: { action: string; metadata?: Record<string, unknown> }) => {
      audited.push(entry);
      return entry;
    }
  };

  return {
    service: new EmailResendService(deliveries, mailer as never, audit as never),
    deliveries,
    original,
    sent,
    audited
  };
};

describe('повторная отправка письма', () => {
  it('уходит ТО ЖЕ письмо, а не собранное заново', async () => {
    // Пересборка из шаблона взяла бы сегодняшние данные: срок, подпись центра, номер
    // удостоверения могли измениться — и слушателю ушло бы ДРУГОЕ письмо под видом повтора.
    const { service, original, sent } = await makeService();

    await service.resend('tenant_a', original.id, CTX);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('learner@example.com');
    expect(sent[0]?.subject).toBe(original.subject);
    expect(sent[0]?.body).toBe(original.body);
  });

  it('письмо без сохранённого тела повторить нельзя — честный отказ', async () => {
    const { service, original, sent } = await makeService({ body: '' });

    await expect(service.resend('tenant_a', original.id, CTX)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(sent).toHaveLength(0);
  });

  it('чужое письмо не найдено — 404, а не отказ по правам', async () => {
    const { service, original } = await makeService({ tenantId: 'tenant_b' });

    await expect(service.resend('tenant_a', original.id, CTX)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('повтор пишется в журнал отдельной строкой со ссылкой на исходное письмо', async () => {
    const { service, deliveries, original } = await makeService();

    const recorded = await service.resend('tenant_a', original.id, CTX);

    expect(recorded.resentFromId).toBe(original.id);
    expect(recorded.status).toBe('sent');
    expect(deliveries.deliveries).toHaveLength(2);
  });

  it('ключ «не отправлять дважды» НЕ переносится — иначе повтор молча пропустят', async () => {
    // dedupKey означает «это уведомление уже отправляли». Повтор делают осознанно, кнопкой.
    const { service, original } = await makeService();

    const recorded = await service.resend('tenant_a', original.id, CTX);

    expect(recorded.dedupKey).toBeUndefined();
  });

  it('неудачный повтор тоже попадает в журнал, а не теряется', async () => {
    const { service, original, deliveries } = await makeService({}, 'fail');

    const recorded = await service.resend('tenant_a', original.id, CTX);

    expect(recorded.status).toBe('failed');
    expect(recorded.error).toBe('mailbox full');
    expect(deliveries.deliveries).toHaveLength(2);
  });

  it('упавший почтовый сервер не роняет запрос — строка журнала всё равно появится', async () => {
    const { service, original } = await makeService({}, 'throw');

    const recorded = await service.resend('tenant_a', original.id, CTX);

    expect(recorded.status).toBe('failed');
    expect(recorded.error).toContain('smtp down');
  });

  it('действие видно в журнале аудита', async () => {
    const { service, original, audited } = await makeService();

    await service.resend('tenant_a', original.id, CTX);

    expect(audited[0]?.action).toBe('communication.email_resent');
    expect(audited[0]?.metadata?.resentFromId).toBe(original.id);
  });
});
