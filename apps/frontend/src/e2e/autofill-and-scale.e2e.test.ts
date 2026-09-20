import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';

/**
 * Автозаполнение форм и уважение к настройкам человека (ТЗ «Стабилизация, UX и развитие»,
 * 14.2 пункт 5 и 14.4; журнал 593, 594).
 *
 * **Что было с автозаполнением.** У формы входа не было ни одного признака автозаполнения —
 * ни у логина, ни у пароля. Хранитель паролей не понимает, что перед ним форма входа: он не
 * предложит подставить пару и не предложит её сохранить. На телефоне это значит набор пароля
 * руками при каждом входе — а значит, пароль покороче и попроще.
 *
 * **Что было с размером шрифта.** Вся шкала была задана в пикселях. Размер в пикселях
 * настройку браузера «размер шрифта по умолчанию» ПРОСТО НЕ ЗАМЕЧАЕТ: человек с плохим
 * зрением увеличил шрифт в настройках, зашёл в систему — и ничего не изменилось. Целевой
 * пользователь здесь — администратор учебного центра, часто немолодой.
 */

const SRC = fromApp('src');

const walkTsx = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkTsx(full));
    else if (name.endsWith('.tsx') && !name.includes('.test.')) out.push(full);
  }
  return out;
};

/**
 * Разбор тегов поля ввода.
 *
 * Наивное «до первой закрывающей скобки» обрывает тег на стрелочной функции обработчика
 * (`onChange={(e) => …}`) — та же грабля, что в стороже клавиатур (журнал 508). Считаем
 * глубину фигурных скобок.
 */
const inputTags = (source: string): string[] => {
  const tags: string[] = [];
  let from = source.indexOf('<input');
  while (from !== -1) {
    let depth = 0;
    for (let i = from; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) {
        tags.push(source.slice(from, i + 1));
        break;
      }
    }
    from = source.indexOf('<input', from + 1);
  }
  return tags;
};

/** Поля, которые обязан узнавать хранитель паролей и автозаполнение браузера. */
const AUTOFILL_FIELDS: ReadonlyArray<{ kind: string; marker: RegExp }> = [
  { kind: 'пароль', marker: /type="password"/ },
  { kind: 'почта', marker: /type="email"|inputMode="email"/ },
  { kind: 'телефон', marker: /type="tel"|inputMode="tel"/ }
];

describe('автозаполнение форм (ТЗ 14.2, пункт 5)', () => {
  const tagsByFile = walkTsx(SRC).map((file) => ({
    file: relative(APP_ROOT, file).replace(/\\/g, '/'),
    tags: inputTags(readFileSync(file, 'utf8'))
  }));

  it('такие поля вообще находятся — иначе сторож сторожит пустоту', () => {
    const count = tagsByFile
      .flatMap((entry) => entry.tags)
      .filter((tag) => AUTOFILL_FIELDS.some((field) => field.marker.test(tag))).length;
    expect(count).toBeGreaterThan(3);
  });

  it('у пароля, почты и телефона объявлено автозаполнение', () => {
    const missing: string[] = [];
    for (const { file, tags } of tagsByFile) {
      for (const tag of tags) {
        for (const field of AUTOFILL_FIELDS) {
          if (!field.marker.test(tag)) continue;
          if (!/autoComplete=/.test(tag)) missing.push(`${file} — ${field.kind}`);
        }
      }
    }
    expect(
      missing,
      'Поле без автозаполнения. Браузер не предложит подставить значение, а хранитель ' +
        'паролей не поймёт, что это форма входа, — на телефоне пароль придётся набирать ' +
        'руками каждый раз.'
    ).toEqual([]);
  });

  it('форма входа названа браузеру полностью: имя И пароль', () => {
    /*
     * Пара `username` + `current-password` и делает форму «формой входа». Одного признака
     * мало: браузер не свяжет два поля и предложит сохранить половину.
     */
    const login = readFileSync(fromApp('src', 'features', 'auth', 'login-form.tsx'), 'utf8');
    expect(login, 'нет признака имени пользователя').toContain('autoComplete="username"');
    expect(login, 'нет признака пароля').toContain('autoComplete="current-password"');
  });
});

describe('уважение к настройкам человека (ТЗ 14.4)', () => {
  const foundation = readFileSync(fromPackages('ui', 'src', 'styles', 'foundation.ts'), 'utf8');
  const tokens = readFileSync(fromPackages('ui', 'src', 'tokens', 'index.ts'), 'utf8');

  it('шкала размеров задана в относительных единицах', () => {
    /*
     * Проверка читает ИСХОДНИК токенов, а не собранную строку: разойтись они не могут, но
     * читать источник честнее — видно и значение, и объяснение рядом с ним.
     */
    const sizes = tokens.match(/'--ui-font-size-[\w]+':\s*'([^']+)'/g) ?? [];
    expect(sizes.length, 'ступени шкалы не найдены').toBeGreaterThan(5);
    const inPixels = sizes.filter((line) => /px'/.test(line));
    expect(
      inPixels,
      'Ступень шкалы в пикселях. Системная настройка «крупный шрифт» на неё не действует ' +
        'вовсе: человек увеличил шрифт в браузере, а интерфейс не изменился.'
    ).toEqual([]);
  });

  it('высота строки задана множителем, а не величиной', () => {
    /*
     * Высота строки в пикселях не растёт вместе с буквами: при крупном шрифте строки
     * наезжают друг на друга. Множитель растёт сам.
     */
    const lineHeights = tokens.match(/'--ui-line-height-[\w]+':\s*'([^']+)'/g) ?? [];
    expect(lineHeights.length).toBeGreaterThan(1);
    for (const line of lineHeights) {
      expect(line, `высота строки задана величиной: ${line}`).not.toMatch(/(px|rem|em)'/);
    }
  });

  it('низ страницы на телефоне знает про системную полосу (ТЗ 14.3)', () => {
    /*
     * Нижние пикселы экрана у телефонов с «чёрточкой» вместо кнопки «Домой» заняты самой
     * системой. Без поправки последняя кнопка — «Следующий вопрос» на экзамене, «Сохранить»
     * в форме — оказывается ровно под ней: видно, а нажать нельзя.
     */
    const phone = foundation.split('@media (max-width: 480px)').slice(1).join('\n');
    expect(phone, 'телефонный участок стилей не найден').not.toBe('');
    const pageRule = phone
      .split('\n')
      .find((line) => line.includes('.ui-page,.ui-page-container {'));
    expect(pageRule, 'правило страницы на телефоне не найдено').toBeTruthy();
    expect(pageRule ?? '', 'нижний отступ страницы не учитывает безопасную зону телефона').toMatch(
      /padding:[^;]*safe-area-inset-bottom/
    );
  });
});
