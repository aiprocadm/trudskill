import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * `CMP-010`: окно берётся из пакета, а не рисуется руками.
 *
 * Самодельная разметка `role="dialog"` выглядит так же, как настоящее окно, и именно поэтому
 * проходит ревью. Но выглядеть — не значит работать: у `Modal` из `@trudskill/ui` есть
 * удержание фокуса внутри окна, закрытие по Esc, блокировка прокрутки страницы под собой и
 * подложка. У самодельного нет ничего из этого.
 *
 * Для человека это значит: с клавиатуры табом уходишь ЗА окно и теряешься на странице под
 * ним, Esc не закрывает (хотя во всех остальных окнах продукта закрывает), а страница
 * прокручивается под открытым окном. Две такие модалки дожили до ревизии 2026-09-08 —
 * перезачисление по переаттестации и подбор вопросов.
 */

const ROOTS = [fromApp('src'), fromApp('app')];

/** Разметка окна своими руками. */
const HAND_ROLLED = /role="dialog"|aria-modal="true"/;

/**
 * Наложения, которые окном не являются, — с причиной.
 *
 * Причина обязана объяснять, почему общий `Modal` тут не подходит, а не просто разрешать.
 */
const ALLOWED: Record<string, string> = {
  'src/widgets/shell/command-palette.tsx':
    'палитра команд — не окно с заголовком, а поле поиска поверх страницы: она открывается ' +
    'по сочетанию клавиш, сама ставит фокус в поле и сама закрывается по Esc; заголовок ' +
    'общего окна ей не нужен'
};

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

const files = ROOTS.flatMap((root) => collect(root));
const asPath = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');

/** Текст вне комментариев: упоминание правила в пояснении — не разметка. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('CMP-010 · окно берётся из пакета', () => {
  it('сканер видит экраны, а не пустой список', () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it('окно не рисуется руками', () => {
    const offenders = files
      .filter((file) => !(asPath(file) in ALLOWED))
      .filter((file) => HAND_ROLLED.test(withoutComments(readFileSync(file, 'utf8'))))
      .map(
        (file) =>
          `${asPath(file)} — своя разметка окна: нет удержания фокуса, Esc и блокировки прокрутки`
      );
    expect(offenders, `самодельных окон: ${offenders.length}`).toEqual([]);
  });

  it('исключение объясняет, почему общий компонент не подходит', () => {
    const vague = Object.entries(ALLOWED)
      .filter(([, why]) => why.trim().length < 40)
      .map(([file]) => file);
    expect(vague).toEqual([]);
  });

  it('список исключений не протухает', () => {
    const known = new Set(files.map(asPath));
    const gone = Object.keys(ALLOWED)
      .filter((file) => !known.has(file))
      .map((file) => `${file} — записан в стороже, но такого экрана больше нет`);
    expect(gone).toEqual([]);
  });
});
