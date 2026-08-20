import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * `UI-023`: цвет статуса и подпись статуса — РАЗНЫЕ входы `StatusChip`.
 *
 * У чипа два пропа: `status` — ключ карты цветов (`semanticStatusMap`), `label` — русская
 * подпись. Ключ и подпись легко перепутать местами, потому что оба строки, и TypeScript
 * молчит: `status` объявлен как `EntityStatus | string`.
 *
 * Цена путаницы односторонняя и незаметная. Если в `status` положить готовую подпись
 * («Активен»), поиск по карте цветов промахнётся и вернёт серый по умолчанию — чип
 * продолжит показывать правильный текст, поэтому на глаз всё в порядке. Молча теряется
 * ровно то, ради чего чип и существует: зелёный «действует» перестаёт отличаться от
 * красного «отозвана». Разведка среза нашла так 11 экранов, в том числе реестры
 * слушателей, клиентов и лицензий — там ВСЕ строки были серыми.
 *
 * Обратную подмену (ключ в `label`) сторож не ищет: она видна сразу — в интерфейсе
 * появляется латиница, и это ловит `latin-titles-ban`.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/** Вызов чипа целиком: от `<StatusChip` до конца открывающего тега. */
const CHIP_CALL = /<StatusChip\b[\s\S]*?\/?>/g;
/** Значение пропа `status={...}` — без вложенных фигурных скобок, их у ключа не бывает. */
const STATUS_PROP = /status=\{([^{}]*)\}/;
/** Второй способ записи того же: `status="active"` — строкой, без скобок. */
const STATUS_PROP_LITERAL = /status="([^"]*)"/;

/**
 * Признаки того, что в `status` попала подпись, а не ключ:
 * — обращение к словарю подписей (`STATUS_LABEL[...]`, `LICENSE_STATUS_LABELS[...]`);
 * — вызов форматера (`formatEntityStatus(...)`) — форматер по определению отдаёт текст
 *   для человека;
 * — строковый литерал кириллицей (`status="Активен"`), ключей кириллицей не бывает.
 */
/*
 * Про `label` без границы слова: первая редакция сторожа писала `\bLABELS?\b` и молча
 * пропускала `LICENSE_STATUS_LABELS[...]` — подчёркивание для регулярного выражения
 * такой же символ слова, как буква, поэтому границы перед «LABELS» там нет. Проверять
 * сторожа надо тем, что он обязан ловить, а не тем, что он зелёный.
 */
const LOOKS_LIKE_LABEL = [
  { rule: /label/i, why: 'словарь подписей' },
  { rule: /\bformat[A-Za-z]*\s*\(/, why: 'вызов форматера' },
  { rule: /[А-Яа-яЁё]/, why: 'русский текст' }
];

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

const violationsIn = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const call of source.matchAll(CHIP_CALL)) {
    const expression = STATUS_PROP.exec(call[0])?.[1]?.trim();
    if (expression) {
      const hit = LOOKS_LIKE_LABEL.find(({ rule }) => rule.test(expression));
      if (hit) found.push(`status={${expression}} — ${hit.why}`);
      continue;
    }
    // Запись строкой: ключ пишется латиницей (`status="active"`), русский текст здесь —
    // та же подмена подписи, просто без фигурных скобок.
    const literal = STATUS_PROP_LITERAL.exec(call[0])?.[1];
    if (literal && /[А-Яа-яЁё]/.test(literal)) found.push(`status="${literal}" — русский текст`);
  }
  return found;
};

describe('UI-023 · подпись статуса не подменяет ключ цвета', () => {
  const files = ROOTS.flatMap((root) => collect(root));

  it('находит экраны со статусами (сторож не пуст)', () => {
    // Защита от «зелёного из-за пустого списка»: если сканер перестанет видеть файлы,
    // проверка ниже пройдёт молча и дефект вернётся незамеченным.
    const withChip = files.filter((file) => readFileSync(file, 'utf8').includes('<StatusChip'));
    expect(withChip.length).toBeGreaterThan(20);
  });

  it('в проп status передаётся ключ карты цветов, а подпись — в label', () => {
    const offenders = files
      .map((file) => ({ file: relative(APP_ROOT, file), found: violationsIn(file) }))
      .filter(({ found }) => found.length > 0)
      .map(({ file, found }) => `${file}: ${found.join('; ')}`);

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
