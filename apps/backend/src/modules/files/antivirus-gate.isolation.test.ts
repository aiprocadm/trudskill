import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Комментарии убираются перед разбором: иначе упоминание вызова в пояснении считается живым
 * кодом. На этой грабле в проекте спотыкались не раз, и здесь цена ошибки особенно велика —
 * «проверка есть» по комментарию означало бы, что файлы уходят непроверенными.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Ни один файл не покидает систему непроверенным (ТЗ «Стабилизация, UX и развитие», 17.5).
 *
 * **Как это устроено сейчас и почему это правильно.** Антивирус проверяет файл не при загрузке,
 * а перед ВЫДАЧЕЙ: `ensureCleanFile` смотрит состояние, и если проверки ещё не было — запускает
 * её тут же. Заражённый файл не отдаётся, файл с несостоявшейся проверкой — тоже.
 *
 * Такой порядок надёжнее проверки при загрузке: загрузок много и они разные (материалы курса,
 * сканы лицензий, селфи, видео экзамена, пакеты SCORM, шаблоны документов), а выдача — узкое
 * место, через которое проходит всё. Забыть проверку на одном из восьми путей загрузки легко;
 * пройти мимо единственных ворот — заметно.
 *
 * **Чего здесь не хватало (журнал 581).** Эти ворота держались на дисциплине: написать новый
 * метод чтения мимо `ensureCleanFile` ничто не мешало. А заметить такую ошибку по коду почти
 * невозможно — метод выглядит рабочим и работает, просто отдаёт непроверенное. Сторож
 * закрывает именно это.
 */

const here = dirname(fileURLToPath(import.meta.url));
const service = stripComments(readFileSync(resolve(here, 'files.service.ts'), 'utf8'));

/** Методы, которые отдают наружу содержимое файла или путь к нему. */
const READING_METHODS = ['createDownloadUrl', 'getReadableFile', 'openFileStream'];

describe('антивирусные ворота нельзя обойти (ТЗ 17.5)', () => {
  it.each(READING_METHODS)('%s проходит через проверку', (method) => {
    /*
     * Берём тело метода до следующего объявления и требуем вызова ворот внутри. Проверять
     * наличие слова во всём файле бессмысленно: оно там есть в любом случае.
     */
    const start = service.indexOf(`async ${method}(`);
    expect(start, `метод ${method} исчез — список устарел`).toBeGreaterThan(-1);
    /*
     * Тело берём ДО следующего объявления, а не «столько-то символов вперёд». Окно
     * фиксированной длины захватывало соседний метод, и подсаженный обход ворот в коротком
     * методе проходил незамеченным: проверка находила вызов у соседа.
     */
    const rest = service.slice(start + 1);
    const nextAt = rest.search(/\n  (?:private )?(?:async )?\w+\(/);
    const body = nextAt === -1 ? rest : rest.slice(0, nextAt);
    expect(body, `${method} отдаёт файл мимо антивирусных ворот`).toMatch(
      /this\.ensureCleanFile\(/
    );
  });

  it('список методов не протух: другие способы отдать файл не завелись', () => {
    /*
     * Ищем обращения к хранилищу за содержимым. Каждое такое обращение обязано быть в списке
     * выше — иначе появился новый путь наружу, и сторож о нём не знает.
     */
    const storageReads = [
      ...service.matchAll(/this\.storage\.(createPresignedDownloadUrl|getObjectStream)\(/g)
    ];
    expect(
      storageReads.length,
      'обращения к хранилищу исчезли — проверка мерит пустоту'
    ).toBeGreaterThan(0);

    for (const match of storageReads) {
      const before = service.slice(Math.max(0, match.index - 900), match.index);
      const method = [...before.matchAll(/async (\w+)\(/g)].at(-1)?.[1];
      expect(
        READING_METHODS,
        `метод ${method} читает хранилище, но не числится среди проверяемых — добавьте его в список и убедитесь, что он проходит ворота`
      ).toContain(method);
    }
  });

  it('непроверенный файл проверяется прямо перед выдачей, а не пропускается', () => {
    /*
     * Ключевая строчка всей защиты. Без неё файл, чью проверку не успели провести, ушёл бы
     * наружу как обычный: состояние «ещё не проверяли» выглядит безобидно.
     */
    const gate = service.slice(service.indexOf('private async ensureCleanFile('));
    expect(gate).toMatch(/if \(status === 'pending'\)[\s\S]{0,200}this\.scanFile\(/);
  });

  it('заражённый файл не отдаётся', () => {
    const gate = service.slice(service.indexOf('private async ensureCleanFile('));
    expect(gate).toMatch(/status === 'infected'/);
    expect(gate).toMatch(/file_infected/);
  });

  it('несостоявшаяся проверка — тоже отказ, а не выдача', () => {
    /*
     * Самая частая ошибка в таких воротах: пропускать всё, кроме явно заражённого. Тогда сбой
     * антивируса превращается в открытую дверь — и именно в тот момент, когда он сломан.
     */
    const gate = service.slice(service.indexOf('private async ensureCleanFile('));
    expect(gate).toMatch(/status !== 'clean'/);
    expect(gate).toMatch(/file_scan_failed/);
  });
});
