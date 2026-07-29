import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemorySimpleSignatureRepository } from './in-memory-simple-signature.repository.js';
import { SimpleSignatureService } from './simple-signature.service.js';

import type { LegalLogWriter } from './legal-log.writer.js';
import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * ПЭП: соглашение и подписанные действия (ФТ-C1.1, Фаза 3 Task 3).
 * Проверяем не «сохранилось ли», а доказуемость: что подписано, кем, откуда.
 */

const T = 'tenant_demo';
const CTX = {
  tenantId: T,
  userId: 'u1',
  ip: '10.0.0.7',
  userAgent: 'Mozilla/5.0'
} as unknown as RequestContext;

const BODY = 'Соглашение об электронном взаимодействии между центром и слушателем.';

function makeService() {
  const repo = new InMemorySimpleSignatureRepository();
  const write = vi.fn(async () => undefined);
  const service = new SimpleSignatureService(repo, { write } as unknown as LegalLogWriter);
  return { service, repo, write };
}

describe('SimpleSignatureService — соглашение', () => {
  it('первое сохранение создаёт версию 1', async () => {
    const { service } = makeService();
    expect((await service.saveAgreement(T, BODY)).version).toBe(1);
  });

  it('изменение текста создаёт НОВУЮ версию, старая не переписывается', async () => {
    const { service } = makeService();
    await service.saveAgreement(T, BODY);
    const next = await service.saveAgreement(T, `${BODY} Дополнение про уведомления.`);
    expect(next.version).toBe(2);
  });

  it('правка только пробелов НЕ создаёт версию — иначе все принимают заново', async () => {
    const { service } = makeService();
    const first = await service.saveAgreement(T, BODY);
    const again = await service.saveAgreement(T, `  ${BODY}   \n\n`);
    expect(again.version).toBe(first.version);
  });

  it('слишком короткий текст отвергается — это юридический документ', async () => {
    const { service } = makeService();
    await expect(service.saveAgreement(T, 'Согласен')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SimpleSignatureService — принятие', () => {
  it('без опубликованного соглашения принять нечего', async () => {
    const { service } = makeService();
    await expect(service.accept(T, 'u1', CTX)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('принятие фиксирует хэш текста, IP и user-agent', async () => {
    const { service, write } = makeService();
    const agreement = await service.saveAgreement(T, BODY);

    const acceptance = await service.accept(T, 'u1', CTX);

    // Хэш ИМЕННО ТОГО текста: ссылка на «соглашение тенанта» ничего не доказывала бы.
    expect(acceptance.bodyHash).toBe(agreement.bodyHash);
    expect(acceptance).toMatchObject({ ip: '10.0.0.7', userAgent: 'Mozilla/5.0' });
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'esignature.agreement_accepted' })
    );
  });

  it('повторное принятие той же версии идемпотентно — момент подписи не сдвигается', async () => {
    const { service } = makeService();
    await service.saveAgreement(T, BODY);
    const first = await service.accept(T, 'u1', CTX);
    const second = await service.accept(T, 'u1', CTX);

    // Юридически значим ПЕРВЫЙ момент принятия.
    expect(second.id).toBe(first.id);
    expect(second.acceptedAt).toBe(first.acceptedAt);
  });

  it('после изменения текста требуется принять заново', async () => {
    const { service } = makeService();
    await service.saveAgreement(T, BODY);
    await service.accept(T, 'u1', CTX);
    expect((await service.getStatus(T, 'u1')).acceptanceRequired).toBe(false);

    await service.saveAgreement(T, `${BODY} Новый пункт.`);

    expect((await service.getStatus(T, 'u1')).acceptanceRequired).toBe(true);
  });

  it('принятие одного пользователя не засчитывается другому', async () => {
    const { service } = makeService();
    await service.saveAgreement(T, BODY);
    await service.accept(T, 'u1', CTX);

    expect((await service.getStatus(T, 'u2')).acceptanceRequired).toBe(true);
  });

  it('соглашение чужого тенанта не применяется', async () => {
    const { service } = makeService();
    await service.saveAgreement('tenant_other', BODY);
    const status = await service.getStatus(T, 'u1');
    expect(status.hasAgreement).toBe(false);
    // Нет соглашения — нечего и принимать, экран принятия не показываем.
    expect(status.acceptanceRequired).toBe(false);
  });
});

describe('SimpleSignatureService — подпись действий', () => {
  it('без принятого соглашения действие НЕ подписывается', async () => {
    const { service, write } = makeService();
    await service.saveAgreement(T, BODY);

    const signed = await service.signAction(
      T,
      'u1',
      { entityType: 'learning.material', entityId: 'mat_1', eventType: 'x', description: 'd' },
      CTX
    );

    // Молча «подписать» без принятого соглашения — это подделка доказательства.
    expect(signed).toBe(false);
    expect(write).not.toHaveBeenCalledWith(expect.objectContaining({ eventType: 'x' }));
  });

  it('после принятия действие пишется в юридический журнал', async () => {
    const { service, write } = makeService();
    await service.saveAgreement(T, BODY);
    await service.accept(T, 'u1', CTX);

    const signed = await service.signAction(
      T,
      'u1',
      {
        entityType: 'learning.material',
        entityId: 'mat_1',
        eventType: 'learning.material_acknowledged',
        description: 'Ознакомлен с материалом'
      },
      CTX
    );

    expect(signed).toBe(true);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'learning.material_acknowledged',
        payload: expect.objectContaining({ signedWith: 'simple_electronic_signature' })
      })
    );
  });

  it('устаревшее принятие не подписывает — текст изменился', async () => {
    const { service } = makeService();
    await service.saveAgreement(T, BODY);
    await service.accept(T, 'u1', CTX);
    await service.saveAgreement(T, `${BODY} Изменение.`);

    const signed = await service.signAction(
      T,
      'u1',
      { entityType: 'e', entityId: '1', eventType: 'x', description: 'd' },
      CTX
    );

    expect(signed).toBe(false);
  });
});
