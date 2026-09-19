import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BackgroundTasksService } from './background-tasks.service.js';

/**
 * Задача закрывается и человек об этом узнаёт (ТЗ 12.2, срез 2).
 *
 * **Как было после среза 1.** Задача СТАВИЛАСЬ в реестр и оставалась в нём навсегда: закрыть её
 * было некому, человек видел вечное «В очереди» (журнал 521). Выдача документов в реестр не
 * попадала вовсе — хотя это такая же долгая операция (520).
 *
 * **Что закреплено.**
 *
 * 1. Отчёт воркера закрывает задачу — и при успехе, и при отказе.
 * 2. Отказ обработки не проглатывается: сообщение обязано вернуться в очередь и попасть в
 *    карантин, иначе зачисление потеряется навсегда.
 * 3. При завершении человек получает уведомление в колокольчик (ТЗ 12.2 прямо этого требует).
 * 4. Выдача документов заводит запись в том же реестре.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = join(HERE, '..');
const read = (file: string): string => readFileSync(join(MODULES, file), 'utf8');

/** Колокольчик-запись: видно, что именно ему отдали. */
class RecordingNotifications {
  readonly created: Array<Record<string, unknown>> = [];
  async create(seed: Record<string, unknown>): Promise<void> {
    this.created.push(seed);
  }
}

describe('фоновая задача закрывается и о ней сообщают (ТЗ 12.2, срез 2)', () => {
  it('закрытие по ключу сообщения находит задачу и метит её итогом', async () => {
    const service = new BackgroundTasksService();
    await service.start({
      tenantId: 't1',
      kind: 'bulk_enrollment',
      title: 'Массовое зачисление: 3 чел.',
      messageId: 'msg-1'
    });

    await service.finishByMessage('t1', 'msg-1', { status: 'succeeded', doneCount: 3 });

    const [task] = await service.list('t1');
    expect(task?.status).toBe('succeeded');
    expect(task?.doneCount).toBe(3);
    expect(task?.finishedAt, 'время завершения обязано появиться').toBeTruthy();
  });

  it('отказ несёт причину словами, а не кодом', async () => {
    const service = new BackgroundTasksService();
    await service.start({ tenantId: 't1', kind: 'bulk_enrollment', title: 'x', messageId: 'm' });
    await service.finishByMessage('t1', 'm', {
      status: 'failed',
      errorText: 'Группа закрыта — зачислять в неё нельзя'
    });

    const [task] = await service.list('t1');
    expect(task?.status).toBe('failed');
    expect(task?.errorText).toBe('Группа закрыта — зачислять в неё нельзя');
  });

  it('чужой ключ сообщения ничего не закрывает', async () => {
    const service = new BackgroundTasksService();
    await service.start({ tenantId: 't1', kind: 'bulk_enrollment', title: 'x', messageId: 'm' });
    await service.finishByMessage('t1', 'другое-сообщение', { status: 'succeeded' });

    const [task] = await service.list('t1');
    expect(task?.status, 'задача не своя — трогать её нельзя').toBe('queued');
  });

  it('при завершении человек получает уведомление', async () => {
    const bell = new RecordingNotifications();
    const service = new BackgroundTasksService(undefined, bell as never);
    await service.start({
      tenantId: 't1',
      kind: 'bulk_enrollment',
      title: 'Зачисление',
      messageId: 'm'
    });
    await service.finishByMessage('t1', 'm', { status: 'succeeded' });

    expect(bell.created, 'иначе человек, закрывший страницу, об итоге не узнает').toHaveLength(1);
    expect(String(bell.created[0]?.subjectText)).toContain('Готово');
    expect(String(bell.created[0]?.subjectText)).toContain('Зачисление');
  });

  it('уведомление об отказе называет причину', async () => {
    const bell = new RecordingNotifications();
    const service = new BackgroundTasksService(undefined, bell as never);
    await service.start({
      tenantId: 't1',
      kind: 'bulk_enrollment',
      title: 'Зачисление',
      messageId: 'm'
    });
    await service.finishByMessage('t1', 'm', { status: 'failed', errorText: 'Группа закрыта' });

    expect(String(bell.created[0]?.subjectText)).toContain('Не выполнена');
    expect(String(bell.created[0]?.bodyText)).toBe('Группа закрыта');
  });

  it('отказ колокольчика не отменяет закрытие задачи', async () => {
    const broken = {
      create: async () => {
        throw new Error('колокольчик недоступен');
      }
    };
    const service = new BackgroundTasksService(undefined, broken as never);
    await service.start({ tenantId: 't1', kind: 'bulk_enrollment', title: 'x', messageId: 'm' });
    await service.finishByMessage('t1', 'm', { status: 'succeeded' });

    const [task] = await service.list('t1');
    expect(task?.status, 'второстепенный канал не отменяет главного').toBe('succeeded');
  });

  it('отчёт воркера закрывает задачу и не проглатывает отказ', () => {
    const controller = read('mvp/mvp-internal-worker.controller.ts');
    expect(/finishByMessage\([^)]*status: 'succeeded'/s.test(controller), 'успех отмечается').toBe(
      true
    );
    expect(/finishByMessage\([^)]*status: 'failed'/s.test(controller), 'отказ отмечается').toBe(
      true
    );
    expect(
      /catch \(error\) \{[\s\S]*?throw error;/.test(controller),
      'проглоченный отказ = потерянное зачисление: сообщение обязано вернуться в очередь'
    ).toBe(true);
  });

  it('выдача документов заводит запись в том же реестре', () => {
    const enqueue = read('documents/documents-enqueue.service.ts');
    expect(/this\.tasks\?\.start\(/.test(enqueue)).toBe(true);
    expect(enqueue).toContain("kind: 'document_issue'");
    expect(
      enqueue.indexOf('await this.tasks?.start('),
      'запись — ПОСЛЕ публикации, как и у зачисления'
    ).toBeGreaterThan(enqueue.indexOf('await this.rabbitMq.publish('));
  });
});
