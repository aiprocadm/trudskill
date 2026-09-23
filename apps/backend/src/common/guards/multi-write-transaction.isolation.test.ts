import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Класс сверки «операция, упавшая на середине, оставляет данные согласованными»
 * (режим ревизии, 2026-09-20).
 *
 * **Половина этого класса закрыта по построению, и это стоит знать.** Состояние центра в
 * памяти (модуль MVP, документы) сохраняется перехватчиком ТОЛЬКО при успехе: упавший
 * обработчик оставляет снимок нетронутым, и никакой «половины операции» не остаётся. Проверять
 * там нечего.
 *
 * **Вторая половина — записи в базу.** Две записи подряд вне транзакции — это операция,
 * которая может остаться наполовину: первая прошла, вторая упала, и данные разошлись.
 * Заметить это по коду трудно — обе строки выглядят одинаково безобидно.
 *
 * **Итог прогона класса (2026-09-20): чисто.** 220 методов с запросами к базе; единственный
 * кандидат оказался ложным — две ветви условия, из которых выполняется ровно одна.
 *
 * **Чего этот сторож НЕ видит, и это honest limitation.** Он смотрит внутрь ОДНОГО метода.
 * Операция, размазанная по двум службам (контроллер зовёт одну, потом другую, и каждая пишет
 * своё), останется незамеченной. Такой класс — отдельный, и он в списке ожидающих прогона;
 * писать здесь проверку, которая делает вид, что покрывает и его, было бы хуже, чем не писать
 * ничего.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');

interface Allowed {
  /** `<путь от src>::<метод>` */
  where: string;
  why: string;
}

/** Методы с двумя и более записями без транзакции — с ответом, почему это законно. */
const WITHOUT_TRANSACTION: ReadonlyArray<Allowed> = [
  {
    where: 'modules/communication/postgres-webinars.repository.ts::upsertParticipantAttendance',
    why: 'это ДВЕ ВЕТВИ условия, а не две операции подряд: строка участия либо правится, либо создаётся — выполняется ровно одна. Гонку двух одновременных входов закрывает «on conflict … do update» у вставки (§5.430, журнал 356)'
  },
  {
    where: 'modules/tasks/postgres-tasks.repository.ts::writeChildren',
    why: 'приватный шаг ВНУТРИ транзакции: принимает PoolClient и вызывается только из insert/update, которые целиком обёрнуты в withTransaction; половины не бывает — откат покрывает и задачу, и её исполнителей с файлами (сторож multi-write-is-atomic это видит по PoolClient в сигнатуре)'
  }
];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') && !full.includes('.test.')) out.push(full);
  }
  return out;
};

/**
 * Тела методов класса.
 *
 * Границей служит отбивка: метод кончается там, где закрывающая скобка стоит на той же
 * глубине, что и его сигнатура. Разбирать TypeScript целиком ради этого сторожа — работа
 * несоразмерная; отбивку в этом коде держит форматировщик, и она надёжна.
 */
const methodBodies = (source: string): Array<{ name: string; body: string }> => {
  const lines = source.split('\n');
  const signature =
    /^(\s+)(?:async\s+|private\s+|public\s+|protected\s+)*(?:async\s+)?([A-Za-z_]\w*)\s*\(/;
  const skip = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor']);
  const out: Array<{ name: string; body: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const match = signature.exec(lines[i]!);
    if (!match || skip.has(match[2]!)) {
      i += 1;
      continue;
    }
    const indent = match[1]!.length;
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j]!;
      const trimmed = line.trim();
      if (trimmed && line.length - line.trimStart().length <= indent && trimmed.startsWith('}')) {
        break;
      }
      j += 1;
    }
    out.push({ name: match[2]!, body: lines.slice(i, j + 1).join('\n') });
    i = j + 1;
  }
  return out;
};

/** Сколько ИЗМЕНЯЮЩИХ запросов в теле метода. */
const writeCount = (body: string): number => {
  let count = 0;
  for (const match of body.matchAll(
    /(?:this\.db|client)\.query(?:<[^>]*>)?\(\s*`?\s*\n?\s*([a-z]+)/gi
  )) {
    if (/^(insert|update|delete)$/i.test(match[1]!)) count += 1;
  }
  for (const match of body.matchAll(/(?:this\.db|client)\.query(?:<[^>]*>)?\(\s*'\s*([a-z]+)/gi)) {
    if (/^(insert|update|delete)$/i.test(match[1]!)) count += 1;
  }
  return count;
};

describe('операция из нескольких записей идёт одной транзакцией (режим ревизии)', () => {
  const methods: Array<{ where: string; writes: number }> = [];
  for (const file of walk(BACKEND_SRC)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('.query')) continue;
    for (const method of methodBodies(source)) {
      if (method.body.includes('withTransaction')) continue;
      const writes = writeCount(method.body);
      if (writes === 0) continue;
      methods.push({
        where: `${relative(BACKEND_SRC, file).replace(/\\/g, '/')}::${method.name}`,
        writes
      });
    }
  }

  it('методы с записями вообще находятся — иначе сторож сторожит пустоту', () => {
    expect(methods.length).toBeGreaterThan(20);
  });

  it('две записи и больше — только под транзакцией либо с названной причиной', () => {
    const allowed = new Set(WITHOUT_TRANSACTION.map((item) => item.where));
    const risky = methods
      .filter((method) => method.writes >= 2 && !allowed.has(method.where))
      .map((method) => `${method.where} (записей: ${method.writes})`);
    expect(
      risky,
      'Появился метод с двумя и более записями в базу вне транзакции. Упав на середине, он ' +
        'оставит данные наполовину изменёнными. Либо оберните в withTransaction, либо ' +
        'внесите метод в WITHOUT_TRANSACTION с ответом: почему половины не бывает.'
    ).toEqual([]);
  });

  it('в реестре нет устаревших строк', () => {
    const known = new Set(methods.map((method) => method.where));
    const stale = WITHOUT_TRANSACTION.filter((item) => !known.has(item.where)).map(
      (item) => item.where
    );
    expect(stale, 'строка реестра больше ни к чему не относится — удалите её').toEqual([]);
  });

  it('у каждого исключения названа причина', () => {
    for (const item of WITHOUT_TRANSACTION) {
      expect(item.why.length, `${item.where}: причина не названа`).toBeGreaterThan(30);
    }
  });

  it('состояние центра в памяти не сохраняется при ошибке обработчика', () => {
    /*
     * Вторая половина класса, закрытая по построению. Проверяется КОНСТРУКЦИЯ, а не слово:
     * сохранение обязано стоять ПОСЛЕ ожидания результата обработчика. Если его поднять выше,
     * упавший обработчик начнёт оставлять половину операции — и заметить это можно будет
     * только на живых данных.
     */
    const interceptor = readFileSync(
      resolve(BACKEND_SRC, 'modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts'),
      'utf8'
    );
    const handled = interceptor.indexOf('await lastValueFrom(next.handle()');
    const saved = interceptor.indexOf('this.persistence.saveFromState');
    expect(handled, 'ожидание результата обработчика не найдено').toBeGreaterThan(0);
    expect(saved, 'сохранение состояния не найдено').toBeGreaterThan(0);
    expect(
      saved,
      'состояние сохраняется ДО завершения обработчика — упавший оставит половину'
    ).toBeGreaterThan(handled);
  });
});
