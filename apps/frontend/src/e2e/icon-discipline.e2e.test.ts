import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * `UI-024`: иконки — только `lucide-react` через компонент `Icon`, размеры 16/20/24,
 * иконка без подписи обязана иметь `aria-label`.
 *
 * Сторож ловит обход набора: значок, нарисованный символом или эмодзи прямо в разметке.
 * Так были сделаны статусы уроков в оглавлении курса (`🔒 ✓ ⏳ ☐`), баннер результата
 * теста (`✓ / ✕`) и стрелка тренда в карточке показателя (`↑ ↓ →`).
 *
 * Дело не в единообразии. Такой значок помечают `aria-hidden` — иначе читалка произнесёт
 * «песочные часы», — и тогда **смысл пропадает совсем**: незрячий слушатель слышит название
 * урока и не знает, пройден он или заблокирован. Настоящая иконка через `Icon` умеет обе
 * роли: декоративную (`aria-hidden`) и смысловую (`role="img"` + `aria-label`).
 */

const ROOTS = [fromApp('src', 'features'), fromApp('src', 'components'), fromApp('app')];

/**
 * Символы, которыми в этом коде рисовали значки: галочки, крестики, стрелки, рамки,
 * плюс эмодзи. Обычная пунктуация («—», «·», «№», кавычки) сюда НЕ входит: она часть текста.
 */
/*
 * Диапазоны перечислены явно, а не «всё нестандартное»: обычная пунктуация — тире «—»,
 * многоточие «…», «№» — часть текста и попадать сюда не должна. Первая редакция сторожа
 * задала диапазоны на глаз и пропустила «⏳» (U+23F3): часы и будильники живут в U+2300–23FF,
 * между стрелками и рамками. Сторож проверен мутацией — см. описание PR.
 */
const ICON_LIKE = /[←-⇿⌀-⏿①-➿⬀-⯿\u{1F300}-\u{1FAFF}]/u;

/** Разрешённые размеры (ТЗ: 16 — в строке, 20 — в меню, 24 — в заголовке). */
const ALLOWED_SIZES = new Set([16, 20, 24]);

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/**
 * Комментарии вырезаются перед проверкой.
 *
 * Иначе сторож запрещал бы ОПИСЫВАТЬ найденное: строка «раньше здесь стояли символы 🔒 ✓ ⏳»
 * в пояснении к правке — это документация, а не значок на экране. Первая редакция сторожа
 * ловила именно её.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Строковые литералы файла — там и живут «значки», подставляемые в разметку. */
const iconLikeLiterals = (raw: string): string[] => {
  const source = withoutComments(raw);
  const found: string[] = [];
  for (const match of source.matchAll(/'([^'\n]{1,4})'|"([^"\n]{1,4})"/g)) {
    const value = (match[1] ?? match[2] ?? '').trim();
    if (!value) continue;
    if (ICON_LIKE.test(value)) found.push(value);
  }
  return found;
};

describe('UI-024 · значок рисуется иконкой, а не символом', () => {
  const files = ROOTS.flatMap((root) => collect(root));

  it('сторож видит экраны (не пустой список)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('в разметке нет значков-символов и эмодзи', () => {
    const offenders = files
      .map((file) => ({
        file: relative(APP_ROOT, file),
        found: iconLikeLiterals(readFileSync(file, 'utf8'))
      }))
      .filter(({ found }) => found.length > 0)
      .map(({ file, found }) => `${file}: ${found.join(' ')}`);

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('размеры иконок — только из шкалы 16/20/24', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<Icon[^>]*?size=\{(\d+)\}/g)) {
        const size = Number(match[1]);
        if (!ALLOWED_SIZES.has(size)) offenders.push(`${relative(APP_ROOT, file)}: size=${size}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
