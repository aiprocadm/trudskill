import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EMAIL_TEMPLATE_DEFAULTS } from './email-templates.js';
import { NOTIFICATION_CATALOGUE, liveEvents, plannedEvents } from './notification-catalogue.js';

/**
 * Матрица уведомлений не расходится ни с кодом, ни с документом (ТЗ 11.1).
 *
 * Матрица нужна не сама по себе, а как ответ на вопрос «что система обещает человеку». Такой
 * ответ обесценивается ровно в тот день, когда перестаёт совпадать с кодом: запись журнала 211
 * — «сводке, которой нельзя верить, перестают верить целиком». Поэтому проверяется тройное
 * согласие: шаблоны в коде ↔ реестр ↔ документ.
 */

/* Пути считаем от этого файла, а не от рабочей папки: она разная у корневого и filter-прогона. */
const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_DIR = HERE;
/* Путь отправителя пишется от `apps/backend/src` — так видно модуль, а не только имя файла. */
const BACKEND_SRC = join(HERE, '..', '..');
const REPO = join(BACKEND_SRC, '..', '..', '..');
const DOC = join(REPO, 'docs', 'notifications-matrix.md');

describe('матрица уведомлений (ТЗ 11.1)', () => {
  it('каждый шаблон письма учтён в реестре ровно одной строкой', () => {
    const inCatalogue = NOTIFICATION_CATALOGUE.map((event) => event.templateKey).filter(Boolean);
    const templates = Object.keys(EMAIL_TEMPLATE_DEFAULTS).sort();
    expect([...inCatalogue].sort(), 'шаблон без строки в матрице — обещание без описи').toEqual(
      templates
    );
    expect(new Set(inCatalogue).size, 'один шаблон — одна строка').toBe(inCatalogue.length);
  });

  it('у каждого действующего события назван существующий отправитель', () => {
    const broken: string[] = [];
    for (const event of liveEvents()) {
      if (!event.sender) {
        broken.push(`${event.key}: отправитель не назван`);
        continue;
      }
      if (!existsSync(join(BACKEND_SRC, event.sender))) {
        broken.push(`${event.key}: файл ${event.sender} не существует`);
        continue;
      }
      /*
       * Файл существует — этого мало. Слепая зона, найденная задачей 11.3 (журнал 596): у
       * повторной проверки знаний пороги «за 14, 7 и 3 дня» лежали в настройках, тест их
       * проверял, а СЛАТЬ их было некому — сканера не существовало. Проверка «файл на месте»
       * такую дыру не видит: она видна только если спросить, шлёт ли названный отправитель
       * именно этот шаблон.
       */
      if (event.templateKey) {
        const sender = readFileSync(join(BACKEND_SRC, event.sender), 'utf8');
        if (!sender.includes(`'${event.templateKey}'`)) {
          broken.push(
            `${event.key}: отправитель ${event.sender} не шлёт шаблон ${event.templateKey}`
          );
        }
      }
    }
    expect(
      broken,
      '«работает» без отправителя — это обещание, которого никто не исполняет'
    ).toEqual([]);
  });

  it('действующее событие имеет каналы, а несделанное их не выдумывает', () => {
    for (const event of liveEvents()) {
      expect(
        event.channels.length,
        `${event.key}: событие без каналов не доходит ни до кого`
      ).toBeGreaterThan(0);
    }
    for (const event of plannedEvents()) {
      expect(event.channels, `${event.key}: у несделанного события каналов быть не может`).toEqual(
        []
      );
      expect(event.gap, `${event.key}: долг без причины — это забытая строка`).toBeTruthy();
      expect(event.templateKey, `${event.key}: шаблона у несделанного события нет`).toBeUndefined();
    }
  });

  it('документ матрицы совпадает с реестром — строка в строку', () => {
    const doc = readFileSync(DOC, 'utf8');
    const missing = NOTIFICATION_CATALOGUE.filter((event) => !doc.includes(event.title));
    expect(
      missing.map((event) => event.key),
      'событие есть в коде, но не названо в документе — документ уже врёт'
    ).toEqual([]);
  });

  it('колокольчик «Уведомления» получает события, а не только сообщения чата', () => {
    /*
     * Главная находка сверки (журнал 509): раздел «Уведомления» — один из ПЯТИ пунктов меню
     * слушателя (задача 6.1), но записи в него создавал только чат. Проверяем не наличие
     * слова, а связку: рассыльщик обязан звать создание уведомления.
     */
    const dispatcher = readFileSync(join(MODULE_DIR, 'notification-dispatcher.service.ts'), 'utf8');
    expect(/this\.notifications\.create\(/.test(dispatcher)).toBe(true);
    expect(dispatcher, 'канал второстепенный: его отказ не должен ронять рассылку').toContain(
      '} catch {'
    );
    for (const event of liveEvents().filter((one) => one.templateKey)) {
      expect(
        event.channels,
        `${event.key}: событие рассылается — значит попадает и в колокольчик`
      ).toContain('in_app');
    }
  });
});
