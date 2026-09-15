import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordCrash } from './crash-log.js';

/**
 * Причина падения пишется в ФАЙЛ (ТЗ «Стабилизация, UX и развитие», 1.2, пункт 3).
 *
 * Почему это не «и так есть». Службы стенда пишут в системный журнал (`StandardOutput=journal`),
 * и он постоянный — но **прочитать его может только член групп `adm`/`systemd-journal`**.
 * Владелец и агент в них не входят: `journalctl -u lms-backend` отвечает «You are currently not
 * seeing messages from other users and the system». То есть запись о падении существует, а
 * человек, которому она нужна, её не видит. Файл рядом со стендом эту дыру закрывает.
 *
 * Правило этого места: **запись о падении не имеет права сделать падение хуже.** Если писать
 * некуда (нет прав, нет места), функция молчит и возвращает `false`, а не бросает второе
 * исключение поверх первого.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crash-log-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('журнал падений', () => {
  it('пишет строку с временем, видом сбоя и сообщением', () => {
    const file = join(dir, 'crash.log');
    const written = recordCrash('uncaughtException', new Error('база недоступна'), file);

    expect(written).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('uncaughtException');
    expect(text).toContain('база недоступна');
    expect(text, 'без времени запись бесполезна — не с чем сопоставить').toMatch(
      /\d{4}-\d{2}-\d{2}/
    );
  });

  it('сохраняет стек — по одному сообщению причину не найти', () => {
    const file = join(dir, 'crash.log');
    recordCrash('unhandledRejection', new Error('пул соединений исчерпан'), file);
    expect(readFileSync(file, 'utf8')).toContain('crash-log.test');
  });

  it('дописывает, а не затирает: второе падение не стирает первое', () => {
    const file = join(dir, 'crash.log');
    recordCrash('uncaughtException', new Error('первое'), file);
    recordCrash('uncaughtException', new Error('второе'), file);

    const text = readFileSync(file, 'utf8');
    expect(text).toContain('первое');
    expect(text).toContain('второе');
  });

  it('создаёт каталог, если его нет', () => {
    const file = join(dir, 'глубже', 'ещё', 'crash.log');
    expect(recordCrash('uncaughtException', new Error('сбой'), file)).toBe(true);
    expect(existsSync(file)).toBe(true);
  });

  it('если писать некуда — молчит, а не роняет процесс повторно', () => {
    /*
     * Путь заведомо непригоден: родитель — не каталог, поэтому создание падает сразу с
     * ENOTDIR. Первая редакция брала путь внутри `/proc`, и `mkdirSync(recursive)` там ВИСЛА:
     * тест не падал, а замирал навсегда. Соседний тест того же набора проходил за две
     * секунды — это и показало, что дело в файле, а не в загруженной машине.
     */
    const impossible = join('/dev/null', 'глубже', 'crash.log');
    expect(() => recordCrash('uncaughtException', new Error('сбой'), impossible)).not.toThrow();
    expect(recordCrash('uncaughtException', new Error('сбой'), impossible)).toBe(false);
  });

  it('принимает не только Error — бросить можно что угодно', () => {
    const file = join(dir, 'crash.log');
    expect(recordCrash('unhandledRejection', 'строка вместо ошибки', file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('строка вместо ошибки');
  });
});
