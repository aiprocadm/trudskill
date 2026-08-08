import { describe, expect, it } from 'vitest';

import {
  computeBackoffMs,
  decideRetry,
  extractRetryCount,
  parseQuarantinedMessage
} from './retry-policy.js';

/**
 * Политика повторов (ФТ-I1, Фаза 6 Task 7).
 *
 * До этой правки правила жили внутри `main.ts` и не были покрыты ни одним тестом —
 * при том что именно они решают, повторить выпуск удостоверения или отложить его
 * в карантин.
 */
const LIMITS = { maxRetries: 10, backoffBaseMs: 1_000, backoffMaxMs: 300_000 };

describe('счётчик попыток не роняет консьюмер', () => {
  it('сообщение вообще без заголовков — это ноль попыток, а не падение', () => {
    // Настоящая поломка: `properties.headers` бывает undefined (чужой издатель, ручная
    // переотправка из админки RabbitMQ). Чтение поля бросало TypeError, а вызов стоял
    // ВНЕ try — падал не документ, а весь разбор очереди.
    expect(extractRetryCount({ properties: {} })).toBe(0);
    expect(extractRetryCount({ properties: { headers: undefined } })).toBe(0);
    expect(extractRetryCount({})).toBe(0);
    expect(extractRetryCount(null)).toBe(0);
  });

  it('мусор в заголовке считается нулём, а не ломает разбор', () => {
    expect(extractRetryCount({ properties: { headers: { 'x-retry-count': 'много' } } })).toBe(0);
    expect(extractRetryCount({ properties: { headers: { 'x-retry-count': -3 } } })).toBe(0);
    expect(extractRetryCount({ properties: { headers: { 'x-retry-count': null } } })).toBe(0);
    expect(extractRetryCount({ properties: { headers: { 'x-retry-count': Infinity } } })).toBe(0);
  });

  it('число читается, в том числе записанное строкой', () => {
    expect(extractRetryCount({ properties: { headers: { 'x-retry-count': 4 } } })).toBe(4);
    expect(extractRetryCount({ properties: { headers: { 'x-retry-count': '7' } } })).toBe(7);
  });
});

describe('задержка перед повтором', () => {
  it('удваивается с каждой попыткой', () => {
    expect(computeBackoffMs(1, LIMITS)).toBe(1_000);
    expect(computeBackoffMs(2, LIMITS)).toBe(2_000);
    expect(computeBackoffMs(3, LIMITS)).toBe(4_000);
  });

  it('не растёт выше предела — иначе документ ушёл бы в ожидание на сутки', () => {
    expect(computeBackoffMs(30, LIMITS)).toBe(300_000);
  });
});

describe('повторить или в карантин', () => {
  it('обычная ошибка — повторить', () => {
    expect(decideRetry(0, new Error('gotenberg down'), LIMITS)).toBe('retry');
  });

  it('исчерпанные попытки — в карантин', () => {
    expect(decideRetry(10, new Error('gotenberg down'), LIMITS)).toBe('dead-letter');
  });

  it('негодные данные — сразу в карантин, без десяти бессмысленных заходов', () => {
    const err = new Error('bad payload');
    err.name = 'ValidationError';
    expect(decideRetry(0, err, LIMITS)).toBe('dead-letter');
  });
});

describe('разбор сообщения из карантина', () => {
  it('вытаскивает тенанта, вид задачи и последнюю ошибку', () => {
    const parsed = parseQuarantinedMessage(
      Buffer.from(
        JSON.stringify({
          messageId: 'msg_1',
          tenantId: 'tenant_demo',
          jobType: 'document',
          payload: { taskId: 'task_1' }
        })
      ),
      { headers: { 'x-retry-count': 10, 'x-last-error': 'gotenberg timeout' } },
      'documents.generate'
    );

    expect(parsed.tenantId).toBe('tenant_demo');
    expect(parsed.jobType).toBe('document');
    expect(parsed.retryCount).toBe(10);
    expect(parsed.lastError).toBe('gotenberg timeout');
    expect(parsed.routingKey).toBe('documents.generate');
  });

  it('не-JSON в карантине не роняет разбор — иначе одно битое сообщение спрятало бы все', () => {
    const parsed = parseQuarantinedMessage('это не json', null);

    expect(parsed.tenantId).toBeNull();
    expect(parsed.jobType).toBeNull();
    expect(parsed.rawBody).toBe('это не json');
    expect(parsed.retryCount).toBe(0);
  });

  it('идентификатор берётся из свойств сообщения, если его нет в теле', () => {
    const parsed = parseQuarantinedMessage('{}', { messageId: 'msg_from_props' });
    expect(parsed.messageId).toBe('msg_from_props');
  });
});
