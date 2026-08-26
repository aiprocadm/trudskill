import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Вебхук не отвечает «принято» молча.
 *
 * Отвечать 200 на событие, которое мы не смогли применить, — правильно: иначе чужая
 * система будет слать его снова и снова, забивая свою очередь, а исход не изменится.
 * Неправильно при этом МОЛЧАТЬ.
 *
 * Ревизия 2026-08-26 нашла восемь таких выходов в трёх вебхуках — платежи, вебинары,
 * видео. Среди них: несовпадение суммы платежа, про которое комментарий рядом прямо
 * говорил «неверная настройка или подделка», — и оно не оставляло следа вообще. Если
 * поставщик сменит формат, оплаты просто перестанут подтверждаться, и узнать об этом будет
 * неоткуда: ответ «ок», журнал пуст.
 *
 * Правило: в обработчике вебхука рядом с ответом «принято» должна быть запись в журнал.
 * Сторож проверяет это грубо — по наличию записи в файле обработчика: точный разбор «этот
 * ли выход» дал бы ложную уверенность, что мы понимаем поток управления.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = resolve(HERE, '..', 'modules');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.controller.ts') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Обработчик вебхука: имя файла или маршрут говорят сами за себя. */
const isWebhookController = (file: string, source: string) =>
  /webhook/i.test(file) || /@Post\('webhook/.test(source);

const ACK = /sendAck\(|ok:\s*true/;
const LOGS = /this\.logger\.(warn|error|log)\(/;

describe('вебхук не отвечает «принято» молча', () => {
  const files = collect(MODULES).filter((file) =>
    isWebhookController(file, readFileSync(file, 'utf8'))
  );

  it('обработчики вебхуков вообще найдены — иначе сторож зеленеет ни на чём', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('каждый обработчик, отвечающий «принято», пишет в журнал', () => {
    const silent = files
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return ACK.test(source) && !LOGS.test(source);
      })
      .map((file) => relative(MODULES, file).split(sep).join('/'))
      .sort();

    expect(
      silent,
      'вебхук отвечает «принято» и ничего не пишет в журнал: смена формата у поставщика ' +
        'останется незамеченной — событие просто перестанет применяться'
    ).toEqual([]);
  });
});
