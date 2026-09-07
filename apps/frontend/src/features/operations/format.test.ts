import { describe, expect, it } from 'vitest';

import { formatDateTime, resolutionNote } from './format';

import type { QuarantinedJob } from './types';

const job = (over: Partial<QuarantinedJob> = {}): QuarantinedJob =>
  ({
    id: 'qtn_1',
    messageId: 'msg_1',
    jobType: 'document',
    queueName: 'jobs.dead-letter',
    routingKey: null,
    retryCount: 10,
    lastError: 'таймаут сборки',
    status: 'republished',
    quarantinedAt: '2026-09-01T10:00:00.000Z',
    resolvedAt: '2026-09-02T08:30:00.000Z',
    resolvedBy: 'user_ops',
    resolvedByName: 'Петров П.',
    republishCount: 1,
    replayable: true,
    ...over
  }) as QuarantinedJob;

/**
 * §5.431: у разобранного сообщения видно, КТО и КОГДА его разобрал.
 *
 * В карантин попадают несостоявшиеся выпуски документов, разбирают их вручную. Сервер хранил
 * и присылал автора разбора, а экран не показывал его вовсе — вопрос «кто отбросил выпуск
 * удостоверения» выяснялся только по базе.
 */
describe('кто и когда разобрал сообщение из карантина', () => {
  it('называет человека и время', () => {
    expect(resolutionNote(job())).toContain('Петров П.');
    expect(resolutionNote(job())).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it('удалённая учётная запись названа прямо, а не «системой»', () => {
    // Правдоподобная неправда хуже честного пробела: по журналу разбирают спор.
    const note = resolutionNote(job({ resolvedByName: null }));

    expect(note).toContain('учётная запись удалена');
    expect(note).not.toContain('система');
    // И уж точно не сырой идентификатор (правило продукта №2).
    expect(note).not.toContain('user_ops');
  });

  it('о повторных возвратах говорит, если они были', () => {
    // Число возвращений меняет решение человека: возвращать ещё раз или отбросить.
    expect(resolutionNote(job({ republishCount: 3 }))).toContain('возвращали 3 раза');
    expect(resolutionNote(job({ republishCount: 1 }))).not.toContain('возвращали');
  });

  it('без времени разбора не выдумывает его', () => {
    expect(resolutionNote(job({ resolvedAt: null }))).toContain('время неизвестно');
  });

  it('дата показывается по-русски, а не машинной строкой', () => {
    expect(formatDateTime('2026-09-02T08:30:00.000Z')).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(formatDateTime(null)).toBe('—');
    // Неразбираемое значение показывается как есть — это лучше, чем «Invalid Date».
    expect(formatDateTime('не дата')).toBe('не дата');
  });
});
