import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT } from './app-root';

/**
 * Ревизия 2026-08-27 (порция 28, журнал 281) — сторож защиты от потери правок.
 *
 * `CMP-010`: боковая панель с формой обязана спрашивать подтверждение при закрытии,
 * иначе Esc или клик мимо панели стирают заполненное молча. Механизм в `DetailDrawer`
 * есть с самого начала, но включается он ТОЛЬКО признаком `hasUnsavedChanges` — и семь
 * форм его не передавали. Ирония: ровно те пять панелей, что перечислены в ТЗ как
 * образцы `CMP-010`, оказались без защиты.
 *
 * Правило: если внутри `<DetailDrawer>` есть поля ввода, признак обязателен.
 * Панели только для просмотра (полей нет) исключены по построению — им терять нечего.
 */

const FIELD_MARKERS =
  /<(input|textarea|select)\b|<(Course|Group|Learner|Client)Select\b|<FilePicker\b/;

const FEATURES_ROOT = join(APP_ROOT, 'src', 'features');

const walkTsx = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkTsx(full));
    else if (name.endsWith('.tsx') && !name.includes('.test.')) out.push(full);
  }
  return out;
};

interface DrawerUsage {
  file: string;
  fieldCount: number;
  declaresUnsaved: boolean;
}

const collectDrawers = (): DrawerUsage[] => {
  const usages: DrawerUsage[] = [];
  for (const file of walkTsx(FEATURES_ROOT)) {
    const source = readFileSync(file, 'utf8');
    let from = source.indexOf('<DetailDrawer');
    while (from !== -1) {
      const closing = source.indexOf('</DetailDrawer>', from);
      if (closing === -1) break;
      const block = source.slice(from, closing);
      const headEnd = block.indexOf('>');
      const head = headEnd === -1 ? block : block.slice(0, headEnd);
      usages.push({
        file: relative(APP_ROOT, file).replace(/\\/g, '/'),
        fieldCount: (block.match(new RegExp(FIELD_MARKERS, 'g')) ?? []).length,
        declaresUnsaved: head.includes('hasUnsavedChanges')
      });
      from = source.indexOf('<DetailDrawer', closing);
    }
  }
  return usages;
};

describe('CMP-010 — панель с формой предупреждает о потере правок', () => {
  const usages = collectDrawers();

  it('сканер видит боковые панели (иначе он зелёный, потому что слеп)', () => {
    expect(usages.length).toBeGreaterThan(10);
    expect(usages.some((u) => u.fieldCount > 0)).toBe(true);
  });

  it('каждая панель с полями ввода объявляет признак несохранённых правок', () => {
    const violations = usages
      .filter((u) => u.fieldCount > 0 && !u.declaresUnsaved)
      .map((u) => `${u.file} (полей: ${u.fieldCount})`);

    expect(
      violations,
      [
        'Боковая панель с формой не передаёт hasUnsavedChanges:',
        ...violations,
        'Без него Esc и клик мимо панели стирают заполненное молча (CMP-010).',
        'Передайте признак — например, isFormDirty(form, initialForm) из lib/forms/dirty.'
      ].join('\n')
    ).toEqual([]);
  });
});
