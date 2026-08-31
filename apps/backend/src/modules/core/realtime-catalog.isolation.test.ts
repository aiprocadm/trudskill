import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { realtimeCatalog } from '@trudskill/api-contracts';
import { describe, expect, it } from 'vitest';

/**
 * Каталог живых событий описывает то, что происходит на самом деле.
 *
 * `RealtimeEventName` объявлен закрытым союзом — то есть обещает: вот все события, какие
 * бывают. По нему фронтенд решает, на что реагировать, а следующий разработчик — какие
 * события уже есть. Каталог, который врёт, хуже отсутствующего: по нему нельзя ни узнать
 * правду, ни доверять типу.
 *
 * Врал он в обе стороны (журнал 319):
 *   • **девять публикуемых событий в каталог не входили** — четыре про выгрузки интеграций
 *     и пять про электронную подпись. Тип этого не ловил: `RealtimeEventsService` объявлял
 *     СВОЙ конверт с `event_name: string`, и закрытый союз в этом месте терялся;
 *   • **два события каталога не публикует никто** — `dialog.updated` и `unread.changed`.
 *
 * Проверено подсадным нарушителем: новая публикация с именем вне каталога роняет тест.
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

/**
 * Имена событий, которые бэкенд действительно публикует.
 *
 * Имя попадает в конверт тремя способами, и учитывать надо все три, иначе инвентарь увидит
 * часть и позеленеет на дыре: литералом (`event_name: 'x.y'`), через константу
 * (`event_name: ASYNC_TASK_STATUS_CHANGED_EVENT`) и строковым аргументом обёртки
 * (`publishRealtime(…)`, `this.publish(…)`). Константы резолвим по объявлениям бэкенда —
 * брать все подряд `*_EVENT` нельзя: тем же узором названы события внутри процесса
 * (`ENROLLMENT_COMPLETED_EVENT`), к живым обновлениям отношения не имеющие.
 */
/**
 * Аргументы вызова часто разнесены по строкам, поэтому между скобкой и именем разрешён
 * перенос — но ЛЕНИВО, с потолком в 120 символов и БЕЗ закрывающей скобки: иначе совпадение
 * уходило за пределы вызова и принимало за событие соседнюю строку (так в инвентарь попало
 * `documents.task.cancelled` — имя действия в журнале аудита, а не событие).
 *
 * Проходы разделены намеренно. Одна общая регулярка с `[^,]+` внутри жадно перескакивала
 * через соседние `event_name:` (matchAll продолжает от конца предыдущего совпадения), и
 * события молча выпадали из инвентаря — сторож обвинял невиновных и не видел виноватых.
 * Отдельные проходы этим не страдают, а `event_name:` разрешено переносить на другую строку:
 * именно так записано одно из событий выгрузки.
 */
const NAME = '([a-z_]+(?:\\.[a-z_]+)+)';
const REF = '([A-Za-z_][A-Za-z0-9_.]*)';
const PASSES = [
  new RegExp(`event_name:\\s*'${NAME}'`, 'g'),
  new RegExp(`(?:this\\.)?publish[A-Za-z]*\\([^)]{0,120}?,\\s*'${NAME}'`, 'g')
];
const REF_PASSES = [
  new RegExp(`event_name:\\s*${REF}`, 'g'),
  new RegExp(`(?:this\\.)?publish[A-Za-z]*\\([^)]{0,120}?,\\s*${REF}`, 'g')
];

const publishedNames = (): string[] => {
  const files = sources(BACKEND_SRC);
  const texts = files.map((file) => readFileSync(file, 'utf8'));
  const names = new Set<string>();

  // Файл, названный «realtime-events», И ЕСТЬ объявление публикуемых имён: все его значения
  // считаем опубликованными. Без этого правила инвентарь терял событие, выбираемое тернарным
  // условием на четырёх строках (`? …failed : …completed`) — регулярка такое не берёт, а
  // парсер ради одного места заводить дороже, чем признать файл источником правды.
  for (const [index, file] of files.entries()) {
    if (!/-realtime-events\.ts$/.test(file)) continue;
    for (const m of (texts[index] ?? '').matchAll(new RegExp(`:\\s*'${NAME}'`, 'g'))) {
      if (m[1]) names.add(m[1]);
    }
  }

  // Объявления констант: `const X = 'a.b'` и таблицы имён вида `completed: 'a.b'`.
  const constants = new Map<string, string>();
  for (const text of texts) {
    for (const m of text.matchAll(
      new RegExp(`(?:const|readonly)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::[^=]+)?=\\s*'${NAME}'`, 'g')
    )) {
      if (m[1] && m[2]) constants.set(m[1], m[2]);
    }
    for (const m of text.matchAll(new RegExp(`([A-Za-z_][A-Za-z0-9_]*):\\s*'${NAME}'`, 'g'))) {
      if (m[1] && m[2] && m[1] !== 'event_name') constants.set(m[1], m[2]);
    }
  }

  for (const text of texts) {
    for (const pass of PASSES) {
      for (const m of text.matchAll(pass)) if (m[1]) names.add(m[1]);
    }
    for (const pass of REF_PASSES) {
      for (const m of text.matchAll(pass)) {
        const resolved = constants.get((m[1] ?? '').split('.').pop() ?? '');
        if (resolved) names.add(resolved);
      }
    }
  }
  return [...names].sort();
};

const catalogNames = (): string[] => [...new Set(Object.values(realtimeCatalog))].sort();

describe('каталог живых событий описывает то, что происходит', () => {
  it('каждое публикуемое событие есть в каталоге', () => {
    const catalog = new Set<string>(catalogNames());
    const missing = publishedNames().filter((name) => !catalog.has(name));

    expect(
      missing,
      'Бэкенд публикует событие, которого нет в `realtimeCatalog`. Закрытый союз обещает ' +
        'фронтенду полный список; событие вне списка приезжает в браузер как неизвестное. ' +
        'Добавьте имя в каталог контрактов.'
    ).toEqual([]);
  });

  it('каждое событие каталога кто-то публикует', () => {
    const published = new Set(publishedNames());
    const orphans = catalogNames().filter((name) => !published.has(name));

    expect(
      orphans,
      'Событие объявлено в каталоге, но его не публикует никто: обещание, которого экран ' +
        'не дождётся. Либо доведите публикацию, либо уберите имя из каталога.'
    ).toEqual([]);
  });

  it('копия каталога в службе realtime совпадает с каноном', () => {
    // Служба realtime намеренно не зависит от пакета контрактов (поднимается отдельно,
    // держит минимум зависимостей), поэтому союз там продублирован. Дубль без сверки —
    // это расхождение, отложенное на будущее: событие добавят в канон, а служба его не
    // узнает. Сверяем списки на равенство.
    const source = readFileSync(
      resolve(BACKEND_SRC, '../../realtime/src/realtime-backend.ts'),
      'utf8'
    );
    const union = source.slice(source.indexOf('export type RealtimeEventName'));
    const copy = [...union.slice(0, union.indexOf(';')).matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)]
      .map((m) => m[1] as string)
      .sort();

    expect(copy, 'копия каталога в apps/realtime разошлась с контрактами').toEqual(catalogNames());
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустой список сделал бы обе проверки зелёными ни на чём.
    expect(publishedNames().length).toBeGreaterThan(5);
    expect(catalogNames().length).toBeGreaterThan(5);
  });
});
