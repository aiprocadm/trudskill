import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Экран-заглушка обязан сказать о себе сам.
 *
 * В продукте есть разделы без серверной части: введённое живёт в памяти страницы и
 * пропадает при перезагрузке. Скрытие таких разделов из меню — уже принятое решение
 * (`ia-architecture`, `HIDDEN_STUB_ROUTES`), но по прямым ссылкам на них заходят.
 *
 * Молчащая заглушка обманывает: человек заполнил форму, увидел строку в таблице и ушёл,
 * считая работу сделанной. Поэтому правило: **раздел без серверной части показывает
 * `PreviewNotice`** — одинаковыми словами на всех таких экранах.
 *
 * Найдено срезом 44 при разборе `MET-001`: экраны «Системные формы» и «Сделки» выглядели
 * полностью рабочими (журнал 197, 201).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

/** Экран → почему он считается заглушкой. Список ведётся руками и должен сокращаться. */
const STUB_SCREENS: Record<string, string> = {
  'app/forms/page.tsx':
    'системные формы: серверной части нет вовсе — ни ручки, ни таблицы в бэкенде',
  'app/crm/deals/page.tsx': 'сделки складываются в useState, ручки создания сделки нет'
};

describe('экран без серверной части не выдаёт себя за рабочий', () => {
  it('файлы заглушек на месте', () => {
    const gone = Object.keys(STUB_SCREENS).filter((file) => !existsSync(join(FRONTEND, file)));
    expect(gone, `заглушка переехала — поправьте список:\n${gone.join('\n')}`).toEqual([]);
  });

  it('каждая заглушка показывает предупреждение', () => {
    const silent = Object.keys(STUB_SCREENS).filter(
      (file) => !readFileSync(join(FRONTEND, file), 'utf8').includes('<PreviewNotice')
    );

    expect(
      silent,
      `эти разделы не сохраняют данные и молчат об этом:\n${silent.join('\n')}\n` +
        'Добавьте <PreviewNotice> или, если серверная часть появилась, вычеркните экран из списка.'
    ).toEqual([]);
  });

  it('заглушка не предлагает ввод, который заведомо пропадёт', () => {
    // Показать пустой список — честно. Дать форму, складывающую данные в никуда, — нет.
    const withInputs = Object.keys(STUB_SCREENS).filter((file) => {
      const source = readFileSync(join(FRONTEND, file), 'utf8');
      return /<input\b/.test(source) && !source.includes('PreviewNotice');
    });

    expect(withInputs, `форма без серверной части:\n${withInputs.join('\n')}`).toEqual([]);
  });
});
