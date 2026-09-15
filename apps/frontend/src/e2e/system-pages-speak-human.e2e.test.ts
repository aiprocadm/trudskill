import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Страницы-сообщения системы говорят по-человечески (ТЗ «Стабилизация, UX и развитие», 2.1 / Б3).
 *
 * Как было. Отказ в доступе показывал «403 / У вас недостаточно прав для просмотра этой
 * страницы / Вернуться на главную» — вне оболочки, без меню, без выхода. «Не найдено» —
 * «404 / Страница не найдена.». Сбой страницы печатал человеку служебный текст падения
 * (`error.message`). «Нет сети» была свёрстана встроенными стилями, мимо токенов.
 *
 * Что закрепляем — четыре правила, каждое из которых уже нарушалось:
 *
 * 1. Страница собрана общим компонентом `SystemMessage`, а не своей разметкой. Иначе шаблон
 *    «что случилось → что делать → к кому идти» соблюдает тот, кто про него помнит.
 * 2. Код ответа не выносится в заголовок: «403» человеку не сообщает ничего (правило
 *    продукта №4, `TXT-004`). Его место — спойлер «Подробности».
 * 3. Никаких встроенных стилей: оформление только токенами (`UI-020`).
 * 4. Служебный текст падения не подставляется в человеческие поля — только в `details`.
 *
 * Почему проверка по тексту исходника, а не отрисовкой: React Testing Library в проекте нет
 * (см. CLAUDE.md, раздел про `src/e2e/`). Комментарии снимаются `stripComments` — иначе этот
 * самый комментарий с примером «403» уронил бы проверку №2 на ровном месте (так уже было).
 */

const PAGES = [
  { name: 'отказ в доступе', file: fromApp('app', 'forbidden', 'page.tsx') },
  { name: 'страница не найдена', file: fromApp('app', 'not-found.tsx') },
  { name: 'сбой страницы', file: fromApp('app', 'error.tsx') },
  { name: 'нет связи', file: fromApp('app', 'offline', 'page.tsx') }
] as const;

/** Код страницы без комментариев: их текст — объяснение для разработчика, а не то, что видно. */
const codeOf = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Значение свойства `name="…"` или `name={'…'}` — только строковые литералы. */
const propText = (code: string, name: string): string | null => {
  const quoted = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|\\{'([^']*)'\\}|\\{"([^"]*)"\\})`);
  const found = quoted.exec(code);
  if (!found) return null;
  return found[1] ?? found[2] ?? found[3] ?? found[4] ?? null;
};

describe('страницы-сообщения системы (ТЗ 2.1)', () => {
  it.each(PAGES)('«$name» собрана общим компонентом, а не своей разметкой', ({ file }) => {
    const code = codeOf(file);

    expect(
      /\bSystemMessage\b/.test(code) && /@trudskill\/ui/.test(code),
      'страница обязана брать SystemMessage из общего пакета: шаблон «что случилось → что ' +
        'делать → к кому идти» держит компонент, а не память автора'
    ).toBe(true);

    /* Три части шаблона обязаны быть заданы: типы это требуют, но проверка дешевле спора. */
    for (const part of ['title', 'what', 'next']) {
      expect(propText(code, part), `у страницы нет части шаблона «${part}»`).not.toBeNull();
    }
  });

  it.each(PAGES)('«$name» не кричит человеку кодом ответа', ({ file }) => {
    const code = codeOf(file);
    const title = propText(code, 'title') ?? '';

    expect(
      /\b(40[0-9]|41[0-9]|50[0-9])\b/.test(title),
      `заголовок «${title}» содержит код ответа: человеку он не сообщает ничего, его место — ` +
        'спойлер «Подробности»'
    ).toBe(false);

    /* Заодно: код не должен просачиваться и в остальной видимый текст. */
    for (const part of ['what', 'next', 'whom'] as const) {
      const value = propText(code, part);
      if (value === null) continue;
      expect(
        /\b(40[0-9]|41[0-9]|50[0-9])\b/.test(value),
        `в части «${part}» напечатан код ответа: «${value}»`
      ).toBe(false);
    }
  });

  it.each(PAGES)('«$name» оформлена токенами, а не встроенными стилями', ({ file }) => {
    const code = codeOf(file);
    expect(
      /style=\{\{/.test(code),
      'встроенные стили запрещены (UI-020): цвета и размеры берутся из токенов, иначе страница ' +
        'живёт своей жизнью и не меняется вместе с остальным интерфейсом'
    ).toBe(false);
  });

  it('сбой страницы прячет служебный текст под спойлер, а не печатает в лицо', () => {
    const code = codeOf(fromApp('app', 'error.tsx'));

    /* Служебное — только в `details`. Ищем подстановку `error.` в человеческих полях. */
    for (const part of ['title', 'what', 'next', 'whom']) {
      const substituted = new RegExp(`\\b${part}=\\{[^}]*\\berror\\.`);
      expect(
        substituted.test(code),
        `в части «${part}» подставлен текст самого сбоя: человеку он ничего не объясняет ` +
          '(правило продукта №4). Его место — details под спойлером'
      ).toBe(false);
    }

    expect(
      /\bdetails\b/.test(code) && /\berror\.(digest|message)\b/.test(code),
      'номер случая и текст сбоя обязаны дойти до поддержки — через details'
    ).toBe(true);
  });

  it('падение корневой раскладки оформлено само: стили ему больше некому вставить', () => {
    /* Найдено в этой же задаче. `app/global-error.tsx` ЗАМЕНЯЕТ корневую раскладку, а стили
       пакета вставляет ThemeProvider, живущий в этой раскладке. Страница ставила классы `ui-*`,
       но ни одного правила под ними не было: человек видел голый текст браузера. Такое видно
       только глазами на живом падении — поэтому свойство и закрепляем. */
    const code = codeOf(fromApp('app', 'global-error.tsx'));

    expect(
      /uiGlobalStyles/.test(code) && /<style>/.test(code),
      'страница падения раскладки обязана вставлять строку стилей сама — иначе её классы ui-* ' +
        'не значат ничего'
    ).toBe(true);

    expect(
      /buildThemeVars\(/.test(code),
      'вместе со стилями нужны переменные оформления: без них цвета и отступы берутся из пустоты'
    ).toBe(true);
  });

  it('оболочка стоит там, где она переживёт сбой, и снята там, где нет', () => {
    const withShell = ['app/forbidden/page.tsx', 'app/not-found.tsx'];
    for (const relative of withShell) {
      const code = codeOf(fromApp(...relative.split('/')));
      expect(
        /<AppShell>/.test(code),
        `${relative}: человек обязан остаться внутри системы — с меню и выходом, а не на голом ` +
          'экране с одной ссылкой'
      ).toBe(true);
    }

    /* А вот здесь оболочки быть НЕ должно, и это не забывчивость:
       `error.tsx` ловит в том числе падение самой оболочки — поставить её сюда значит уронить
       страницу сбоя тем же сбоем; «нет сети» не может загрузить то, что оболочка тянет из сети.
       Меню при обычном падении содержимого сохраняет перехватчик внутри оболочки (ТЗ 1.1). */
    for (const relative of ['app/error.tsx', 'app/offline/page.tsx']) {
      const code = codeOf(fromApp(...relative.split('/')));
      expect(
        /<AppShell>/.test(code),
        `${relative}: оболочка здесь недоступна по природе сбоя — см. пояснение в файле`
      ).toBe(false);
    }
  });
});
