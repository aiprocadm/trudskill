import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Отказ действия виден человеку, а не проглатывается молча.
 *
 * Мутации идут через обёртку `useDomainMutations`, и она отказ НЕ ловит — она его
 * пробрасывает. Значит вызов без обработки означает ровно одно: человек нажал кнопку, запрос
 * упал, и на экране не изменилось ничего. Он нажимает ещё раз. И ещё.
 *
 * Так вели себя два действия: «Завершить сеанс» в карточке пользователя (человек уверен, что
 * выгнал чужое устройство, а сеанс жив) и «Добавить версию» в карточке курса. Оба экрана при
 * этом УЖЕ умели показывать ошибку — просто эти кнопки ею не пользовались.
 *
 * Правило: вызов мутации, пущенный через `void`, обязан иметь `.catch`. Проверяется наличие
 * обработки в пределах выражения; список исключений закрытый и с причиной у каждой строки.
 */

const SOURCE = fromApp('src');
const APP = fromApp('app');

/** Имена мутаций берутся из самой обёртки — свой список разошёлся бы с ней при первой правке. */
const mutationNames = (): string[] => {
  const hooks = readFileSync(fromApp('src', 'features', 'mvp', 'hooks.ts'), 'utf8');
  const start = hooks.indexOf('return {', hooks.indexOf('const wrap'));
  const block = hooks.slice(start, start + 9000);
  return [...new Set([...block.matchAll(/\n {4}([a-zA-Z]+):/g)].map((m) => m[1] ?? ''))].filter(
    Boolean
  );
};

const sources = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Исходник без комментариев: пояснение про отказ — не обработка отказа. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * Места, где отказ обработан ИНАЧЕ, с причиной у каждого. Список закрытый: новый молчаливый
 * вызов красит проверку.
 */
const HANDLED_OTHERWISE: Record<string, string> = {};

const names = mutationNames();
const files = [...sources(SOURCE), ...sources(APP)];

const silent = files.flatMap((file) => {
  const lines = codeOnly(readFileSync(file, 'utf8')).split('\n');
  const found: string[] = [];
  lines.forEach((line, index) => {
    if (!line.includes('void ')) return;
    const name = names.find((n) => new RegExp(`\\b${n}\\(`).test(line));
    if (!name) return;
    /* Цепочка может тянуться на несколько строк — смотрим до конца выражения. */
    const window = lines.slice(index, index + 14).join('\n');
    if (!window.includes('.catch'))
      found.push(`${relative(APP_ROOT, file)}:${index + 1} (${name})`);
  });
  return found;
});

describe('отказ действия виден человеку', () => {
  it('список мутаций прочитан из обёртки, а не выдуман', () => {
    /* Сломайся разбор — список опустеет, и запрет стал бы зелёным ни на чём. */
    expect(names.length).toBeGreaterThanOrEqual(20);
    expect(names).toContain('publishCourse');
  });

  it('ни одна мутация не запускается без обработки отказа', () => {
    const unexplained = silent.filter((entry) => !(entry.split(':')[0]! in HANDLED_OTHERWISE));
    expect(
      unexplained,
      'человек нажмёт кнопку, запрос упадёт, и на экране не изменится ничего — он нажмёт ещё раз'
    ).toEqual([]);
  });
});
