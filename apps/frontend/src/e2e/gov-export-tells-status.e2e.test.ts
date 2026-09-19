import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { canRetry, failureReason, whenText } from '../features/gov-export/task-view';

/**
 * Госвыгрузки: статус вместо тишины (ТЗ «Стабилизация, UX и развитие», 12.3).
 *
 * **Как было.** История задач показывала три колонки: реестр, что выгружали, статус. Ни времени,
 * ни причины отказа — хотя сервер отдаёт `requestedAt`, `finishedAt` и ответ реестра: описание
 * данных на экране их просто не перечисляло, и до человека они не доходили (журнал 523). Кнопки
 * «Повторить» не было, хотя ручка `POST /exports/tasks/:id/retry` существует и работает (524).
 * Про неудачную выгрузку никто не сообщал — администратор узнавал о ней, зайдя на экран (525).
 *
 * **Почему это важно.** Выгрузка в госреестр — то, чем центр отчитывается при проверке. «Статус:
 * не выполнена» без причины и без возможности повторить означает звонок разработчику.
 */

const SCREEN = fromApp('src', 'features', 'gov-export', 'gov-export-screen.tsx');
const ORCHESTRATOR = fromApp(
  '..',
  'backend',
  'src',
  'modules',
  'integrations',
  'services',
  'integration-orchestrator.service.ts'
);
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

describe('госвыгрузки говорят статусом, а не молчат (ТЗ 12.3)', () => {
  it('повторять можно только то, что имеет смысл повторять', () => {
    expect(canRetry({ status: 'failed' })).toBe(true);
    expect(canRetry({ status: 'rejected' })).toBe(true);
    expect(canRetry({ status: 'cancelled' })).toBe(true);
    // Успешную — нельзя: в реестр уйдёт второй такой же пакет.
    expect(canRetry({ status: 'succeeded' })).toBe(false);
    expect(canRetry({ status: 'success' })).toBe(false);
    // Идущую — тоже: повтор создаст гонку.
    expect(canRetry({ status: 'running' })).toBe(false);
    expect(canRetry({ status: 'queued' })).toBe(false);
  });

  it('причина отказа достаётся из ответа реестра', () => {
    expect(
      failureReason({
        id: '1',
        providerCode: 'frdo',
        exportType: 'ot',
        status: 'failed',
        responsePayload: { message: 'СНИЛС не найден в реестре' }
      })
    ).toBe('СНИЛС не найден в реестре');

    // Разные ведомства называют поле по-разному — берём первое пригодное.
    for (const key of ['error', 'detail', 'reason']) {
      expect(
        failureReason({
          id: '1',
          providerCode: 'frdo',
          exportType: 'ot',
          status: 'failed',
          responsePayload: { [key]: 'Пакет отклонён' }
        })
      ).toBe('Пакет отклонён');
    }
  });

  it('молчание реестра не превращается в пустую ячейку', () => {
    const reason = failureReason({
      id: '1',
      providerCode: 'f',
      exportType: 'ot',
      status: 'failed'
    });
    expect(reason, 'правило продукта №4: ошибка говорит, что произошло и что делать').toContain(
      'не сообщил причину'
    );
    expect(reason).toContain('Повторите');
  });

  it('у успешной задачи причины отказа нет', () => {
    expect(
      failureReason({
        id: '1',
        providerCode: 'f',
        exportType: 'ot',
        status: 'success',
        responsePayload: { message: 'ок' }
      })
    ).toBe('');
  });

  it('время берётся от завершения, а при его отсутствии — от постановки', () => {
    expect(
      whenText({
        id: '1',
        providerCode: 'f',
        exportType: 'ot',
        status: 'success',
        requestedAt: '2026-09-19T10:00:00.000Z',
        finishedAt: '2026-09-19T10:05:00.000Z'
      })
    ).toBe('2026-09-19T10:05:00.000Z');
    expect(
      whenText({
        id: '1',
        providerCode: 'f',
        exportType: 'ot',
        status: 'running',
        requestedAt: '2026-09-19T10:00:00.000Z'
      }),
      'пустая ячейка читается как «данных нет», хотя время постановки известно всегда'
    ).toBe('2026-09-19T10:00:00.000Z');
  });

  it('экран показывает когда, почему и даёт повторить', () => {
    const screen = read(SCREEN);
    expect(screen, 'колонка времени').toContain("title: 'Когда'");
    expect(screen, 'колонка причины').toContain("title: 'Почему отклонена'");
    expect(screen).toContain('Повторить выгрузку');
    expect(
      /exports\/tasks\/\$\{taskId\}\/retry/.test(screen),
      'повторяем ИМЕННО ту задачу: у неё свой отбор записей'
    ).toBe(true);
    expect(/canRetry\(task\)/.test(screen), 'кнопка только там, где повтор имеет смысл').toBe(true);
  });

  it('неудачная выгрузка сообщает о себе администратору', () => {
    const orchestrator = read(ORCHESTRATOR);
    expect(
      /this\.notifications\s*\?\.create\(/.test(orchestrator),
      'тишина при отказе — центр узнаёт о непопавших в реестр людях при проверке'
    ).toBe(true);
    expect(orchestrator).toContain('Выгрузка в госреестр не выполнена');
    expect(
      /\.catch\(\(\) => undefined\)/.test(orchestrator),
      'уведомление второстепенно: его сбой не отменяет обработку отказа'
    ).toBe(true);
  });
});
