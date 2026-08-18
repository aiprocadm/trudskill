import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT } from './app-root';

/*
 * CMP-006. Браузерные окна `confirm()`, `prompt()` и `alert()` запрещены в интерфейсе:
 * они блокируют поток, не переводятся, не стилизуются, не проходят проверку на 360px
 * и не отличают опасное действие от обычного.
 *
 * ⚠️ Ключевая деталь этого сторожа — он ловит ОБЕ формы вызова. В аудите ТЗ нашлось
 * 9 подтверждений, и два из них были написаны голым `confirm(` без `window.`
 * (`mvp/screens.tsx`). Сторож, ищущий только строку `window.confirm`, отчитался бы
 * о полной замене на неполном шаблоне поиска.
 */
const FORBIDDEN = [
  { name: 'confirm', pattern: /(?<![\w.$])(?:window\.)?confirm\s*\(/ },
  { name: 'prompt', pattern: /(?<![\w.$])(?:window\.)?prompt\s*\(/ },
  { name: 'alert', pattern: /(?<![\w.$])(?:window\.)?alert\s*\(/ }
];

/*
 * Долг, вскрытый этим сторожем. В аудите ТЗ считали только `confirm` (9 штук) — `alert`
 * не считал никто, и он нашёлся в двух заглушках скачивания на экранах слушателя.
 * Экраны слушателя переделываются в Фазе 6, там же уйдут и эти окна: заменять их сейчас
 * значит чинить экран, который через фазу переписывается целиком.
 */
/*
 * Исключений не осталось: обе заглушки скачивания на экранах слушателя заменены
 * выключенными кнопками с пояснением (Фаза 6 срез 5). Сторож остаётся ловить новые окна.
 */
const EXCEPTIONS = new Set<string>([]);

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) acc.push(full);
  }
  return acc;
};

describe('запрет браузерных окон в интерфейсе (CMP-006)', () => {
  it('сканер ловит и window.confirm, и голый confirm', () => {
    // Сторож самого сканера: именно на голой форме прошлый поиск и промахнулся.
    const [confirmRule] = FORBIDDEN;
    expect(confirmRule?.pattern.test('if (!window.confirm("x")) return;')).toBe(true);
    expect(confirmRule?.pattern.test('if (!confirm("x")) return;')).toBe(true);
    // Свои функции с похожими именами под запрет не попадают.
    expect(confirmRule?.pattern.test('await confirmPayment(id);')).toBe(false);
    expect(confirmRule?.pattern.test('props.onConfirm();')).toBe(false);
    expect(confirmRule?.pattern.test('const { confirm } = useConfirmDialog();')).toBe(false);
  });

  it('ни один экран не использует браузерные окна', () => {
    const root = APP_ROOT;
    const offenders: string[] = [];
    for (const file of [...collect(join(root, 'src')), ...collect(join(root, 'app'))]) {
      const rel = file.slice(root.length + 1).replace(/\\/g, '/');
      if (EXCEPTIONS.has(rel)) continue;
      const source = readFileSync(file, 'utf8');
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(source)) {
          offenders.push(`${rel} → ${rule.name}()`);
        }
      }
    }
    expect(offenders, 'браузерные окна вместо диалогов приложения').toEqual([]);
  });
});
