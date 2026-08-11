import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

const collectTsx = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTsx(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
};

describe('запрет styled-jsx во фронтенде (UI-022)', () => {
  it('в компонентах нет <style jsx>, кроме явных исключений', () => {
    const root = process.cwd();
    const offenders = collectTsx(root)
      .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
      .filter((entry) => entry.source.includes('<style jsx'))
      .map((entry) => entry.file.slice(root.length + 1))
      .filter((file) => !ALLOWED.has(file));
    expect(offenders).toEqual([]);
  });
});
