import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Пятый сторож семейства «объявлено — кто это исполняет», но с другой стороны:
 * **планировщик виден с самого запуска, а не с первого прогона.**
 *
 * Механизм отметок (ФТ-I2, Фаза 6 Task 6) заводили ровно ради того, чтобы отличить
 * «планировщик перестал запускаться» от «планировщику нечего делать». В его собственном
 * описании названы три причины: «не тот cron, упавшая блокировка, отключён». Но отметка
 * появлялась ТОЛЬКО после первого успешного прогона — и все три причины выглядели одинаково:
 * метрики для такого планировщика просто НЕ БЫЛО. Тревогу на отсутствующую метрику не
 * напишешь, поэтому молчание оставалось невидимым именно там, где его ждали (журнал 327).
 *
 * Инвариант: класс, у которого есть `@Cron`, обязан объявить себя через `declareScheduler`.
 * Тогда «ни разу не запустился» становится просрочкой через два интервала, а выключенный
 * намеренно помечается отдельно и тревогу не поднимает.
 *
 * Проверено подсадным нарушителем: снятие `declareScheduler` у любого планировщика роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');

const sources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sources(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

interface SchedulerFile {
  file: string;
  declares: boolean;
  jobs: string[];
}

const schedulerFiles = (): SchedulerFile[] => {
  const found: SchedulerFile[] = [];
  for (const file of sources(BACKEND_SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!/@Cron\(/.test(text)) continue;
    found.push({
      file: file.slice(BACKEND_SRC.length + 1),
      declares: /declareScheduler\(/.test(text),
      jobs: [...text.matchAll(/@Cron\([^)]*name:\s*'([^']+)'/g)].map((m) => m[1] as string)
    });
  }
  return found;
};

describe('планировщик объявляет себя при старте', () => {
  it('у каждого класса с @Cron есть declareScheduler', () => {
    const silent = schedulerFiles()
      .filter((item) => !item.declares)
      .map((item) => item.file)
      .sort();

    expect(
      silent,
      'Планировщик не объявляет себя при старте. Пока он ни разу не отработал, метрики для ' +
        'него НЕ СУЩЕСТВУЕТ — а значит «не тот cron», «не взялся замок» и «выключен» ' +
        'выглядят одинаково и не ловятся тревогой. Добавьте `declareScheduler` в ' +
        '`onModuleInit` с ожидаемым интервалом и признаком включённости.'
    ).toEqual([]);
  });

  it('имя работы в объявлении совпадает с именем cron-задачи', () => {
    // Разъехавшиеся имена дают две записи об одном планировщике: одна вечно просрочена,
    // вторая вечно молчит. Хуже, чем отсутствие метрики.
    const mismatched: string[] = [];
    for (const item of schedulerFiles()) {
      const text = readFileSync(resolve(BACKEND_SRC, item.file), 'utf8');
      const declared = [...text.matchAll(/declareScheduler\(\s*'([^']+)'/g)].map(
        (m) => m[1] as string
      );
      for (const job of declared) {
        if (!item.jobs.includes(job)) mismatched.push(`${item.file}: ${job}`);
      }
    }
    expect(mismatched, 'имя в declareScheduler не совпадает с именем @Cron').toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустой список планировщиков сделал бы проверки зелёными.
    expect(schedulerFiles().length).toBeGreaterThanOrEqual(8);
  });
});
