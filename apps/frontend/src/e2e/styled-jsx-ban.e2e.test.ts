import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT } from './app-root';

/*
 * UI-022: styled-jsx возвращает слой CSS, невидимый сторожам `token-discipline` и
 * `touch-targets` — они проверяют строку uiGlobalStyles. Пока стили каркаса жили внутри
 * компонента, дисциплина токенов на них просто не распространялась (288 строк вне надзора).
 *
 * Исключения добавляются только вместе с обоснованием в описании PR.
 */
const ALLOWED = new Set<string>([
  // Календарь переезжает в Фазе 6 вместе с экранами слушателя (ТЗ §5.7, UI-021).
  'app/learning/calendar/page.tsx'
]);

/*
 * Путь приводится к косым чертам вида `app/...`, иначе на Windows сюда приходит
 * `app\learning\calendar\page.tsx`, ни одно исключение не совпадает и сторож краснеет
 * на пустом месте. Та же форма, что у соседних сторожей (`empty-states-explain`,
 * `id-input-ban`, `latin-titles-ban`, `one-word-per-thing`, `unified-states`).
 */
const relFromApp = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');

const collectTsx = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTsx(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
};

const withStyledJsx = collectTsx(APP_ROOT)
  .filter((file) => readFileSync(file, 'utf8').includes('<style jsx'))
  .map(relFromApp)
  .sort();

describe('запрет styled-jsx во фронтенде (UI-022)', () => {
  it('в компонентах нет <style jsx>, кроме явных исключений', () => {
    const offenders = withStyledJsx.filter((file) => !ALLOWED.has(file));
    expect(offenders).toEqual([]);
  });

  /*
   * Без этой проверки промах в записи исключения (иной регистр, разделители пути, переезд
   * файла) остался бы незаметным: список молча перестал бы что-либо разрешать. Так уже
   * случалось на Windows — сторож падал на файле, который в списке есть.
   */
  it('список исключений не содержит несуществующих записей', () => {
    const stale = [...ALLOWED].filter((file) => !withStyledJsx.includes(file));
    expect(stale, 'исключение никого не описывает — уберите его из ALLOWED').toEqual([]);
  });
});
