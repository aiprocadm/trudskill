import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import { activeTab, tabHref } from '../features/navigation/tab-param';

/**
 * «Простыни» разбиты на вкладки (ТЗ «Стабилизация, UX и развитие», 5.7 / Э7).
 *
 * **Как было.** Четыре страницы складывали 4–6 несвязанных блоков в одну ленту:
 *
 * - «Арендаторы платформы»: реестр центров + здоровье + тарифы + счета аренды + форма
 *   создания центра посреди всего этого;
 * - «Документы»: бланки + задачи выпуска + нумераторы + подпись и печать;
 * - «Настройки»: оглавление слева, справа семь разделов подряд, причём часть строк слева
 *   прокручивала ленту, а часть уводила на другую страницу — предсказать клик было нельзя;
 * - карточка курса: версии + нормативные параметры + пакет документов + модули + материалы,
 *   а подсказка «что мешает опубликовать» — в самом низу, где её уже не ищут.
 *
 * Человек прокручивал страницу целиком, чтобы понять, что на ней вообще есть, и терял место,
 * к которому хотел вернуться.
 *
 * **Что закреплено.**
 *
 * 1. Четыре страницы собраны вкладками из пакета (`PageTabs` + `TabPanel`).
 * 2. Вкладки ОДНОГО уровня: вложенных нет нигде (§7.2 — второй уровень превращает навигацию
 *    в лабиринт).
 * 3. Открытая вкладка живёт в адресе (`?tab=`) — ссылку на нужный раздел можно передать.
 * 4. Форма создания открывается панелью, а не стоит блоком внизу ленты.
 */

const TABS = fromPackages('ui', 'src', 'components', 'page-tabs', 'index.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');
const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/** Четыре «простыни» из ТЗ 5.7 — поимённо, чтобы сторож не свёлся к «где-то есть вкладки». */
const SHEETS: Record<string, string> = {
  'src/features/platform-tenants/screens.tsx': 'Арендаторы платформы',
  'src/features/documents/documents-screen.tsx': 'Документы',
  'src/features/settings/settings-screen.tsx': 'Настройки',
  'src/features/courses/courses-screens.tsx': 'Карточка курса'
};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

const screens = (): Array<{ file: string; source: string }> =>
  ROOTS.flatMap((root) => collect(root)).map((file) => ({ file, source: read(file) }));

describe('«простыни» разбиты на вкладки (ТЗ 5.7)', () => {
  /**
   * Полоса вкладок: обычная (`PageTabs`) или оглавление настроек, которое ТЗ §7.5 велит
   * держать колонкой слева. Требование одно — переключатель, меняющий содержимое и ничего
   * больше; вид его на экране настроек задан другим требованием.
   */
  const hasTabStrip = (source: string): boolean =>
    /<PageTabs\b/.test(source) || /<SettingsLayout[\s\S]{0,400}onSelect=/.test(source);

  it('каждая из четырёх страниц собрана вкладками', () => {
    const missing: string[] = [];
    for (const [path, title] of Object.entries(SHEETS)) {
      const source = read(fromApp(...path.split('/')));
      if (!hasTabStrip(source) || !/<TabPanel\b/.test(source)) {
        missing.push(`${title} (${path})`);
      }
    }
    expect(missing, 'ТЗ 5.7 называет эти страницы поимённо').toEqual([]);
  });

  it('открытая вкладка живёт в адресе — ссылку можно передать', () => {
    const without: string[] = [];
    for (const path of Object.keys(SHEETS)) {
      const source = read(fromApp(...path.split('/')));
      /*
       * Ищется ВЫЗОВ, а не упоминание: первая редакция проверяла `includes('useTabParam')`
       * и была довольна одной строкой импорта — подсаженная поломка переименовала хук при
       * импорте, и сторож промолчал (журнал 464). «Настройки» ведут вкладки через свою
       * раскладку, но адрес пишет тот же хук, поэтому проверка одна на все четыре страницы.
       */
      if (!/useTabParam\(/.test(source)) without.push(path);
    }
    expect(without, 'вкладка вне адреса не передаётся ссылкой и ломает кнопку «назад»').toEqual([]);
  });

  it('незнакомая вкладка возвращает к первой, а не к пустому экрану', () => {
    // Опечатка в переданной ссылке не должна наказывать того, кто по ней пришёл.
    expect(activeTab('plans', ['tenants', 'plans'])).toBe('plans');
    expect(activeTab('нет-такой', ['tenants', 'plans'])).toBe('tenants');
    expect(activeTab(null, ['tenants', 'plans'])).toBe('tenants');
    expect(activeTab(null, ['tenants', 'plans'], 'plans')).toBe('plans');
  });

  it('переключение вкладки сохраняет отбор, а не сбрасывает его', () => {
    // Человек отфильтровал список, заглянул в соседнюю вкладку и вернулся — отбор на месте.
    expect(tabHref('/platform/tenants', 'q=ромб&status=active', 'plans')).toBe(
      '/platform/tenants?q=%D1%80%D0%BE%D0%BC%D0%B1&status=active&tab=plans'
    );
    expect(tabHref('/settings', 'tab=payments', 'sms')).toBe('/settings?tab=sms');
  });

  it('вкладки только ОДНОГО уровня — вложенных нет нигде', () => {
    const nested: string[] = [];
    for (const { file, source } of screens()) {
      const opens = (source.match(/<PageTabs\b/g) ?? []).length;
      if (opens < 2) continue;
      /*
       * Две полосы вкладок на экране — это либо два независимых блока (редкость), либо
       * второй уровень. Разбираться глазами: §7.2 запрещает вложенные вкладки прямо.
       */
      nested.push(`${rel(file)}: полос вкладок ${opens}`);
    }
    expect(nested, '§7.2: вложенные вкладки запрещены').toEqual([]);
  });

  it('закрытая вкладка не рисуется вовсе — иначе это та же лента', () => {
    const frame = read(TABS);
    expect(
      /id === activeId \? \(/.test(frame),
      'спрятанное стилем находится поиском по странице и грузит данные впустую'
    ).toBe(true);
  });

  it('форма создания центра открывается панелью, а не стоит блоком в ленте', () => {
    const source = read(fromApp('src', 'features', 'platform-tenants', 'screens.tsx'));
    expect(source).toContain('title="Новый учебный центр"');
    expect(
      /SectionCard title="Новый арендатор"/.test(source),
      'форма посреди ленты — ровно то, что ТЗ 5.7 велит убрать'
    ).toBe(false);
    expect(
      /hasUnsavedChanges=\{code/.test(source),
      'панель с введённым кодом обязана предупредить о потере (CMP-005)'
    ).toBe(true);
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э7');
    expect(doc).toContain('PageTabs');
  });
});
