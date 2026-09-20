import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Сторож защиты от потери несохранённых данных на СТРАНИЦЕ (ТЗ «Стабилизация, UX и развитие»,
 * задача 10.3, журнал 591).
 *
 * **Что было.** Боковая панель спрашивала подтверждение при закрытии (`CMP-010`, сторож
 * `drawer-unsaved-changes`), а страница — не спрашивала никто: механизма для неё не
 * существовало. Человек набирал карточку, промахивался по пункту меню и терял работу молча.
 *
 * **Правило сторожа.** Если на странице (не в панели) есть поле ввода И кнопка сохранения —
 * защита обязательна. Оба признака вместе не случайны: поле без кнопки сохранения — это
 * фильтр или поиск, и спрашивать «уйти без сохранения?» у человека, набравшего фамилию в
 * строке поиска, значит научить его отмахиваться от вопроса. Тогда вопрос перестанет работать
 * и там, где он действительно нужен.
 *
 * **Исключения — поимённо и с причиной.** Список без объяснений превращается в место, куда
 * сваливают неудобные случаи; с причиной каждое исключение можно перечитать и оспорить.
 */

const FIELD_MARKERS =
  /<(input|textarea|select)\b|<(Course|Group|Learner|Client)Select\b|<FilePicker\b/;

/**
 * Кнопка, после которой набранное считается сохранённым. Ищем по тексту кнопки, а не по имени
 * обработчика: имена у нас разные (`save`, `onSave`, `createRule`, `run`), а человек видит
 * именно слово.
 */
const SAVE_MARKERS =
  /> *\n? *(Сохранить|Создать|Записать|Добавить|Применить настройк|Подключить)[^<]*</;

/**
 * Защита считается подключённой, только если её результат ОТРИСОВАН.
 *
 * Проверять наличие вызова `useUnsavedForm(` недостаточно: подсаженная поломка убрала из
 * разметки `{unsavedGuard}`, оставив вызов на месте, — и сторож этого не заметил. Хук без
 * отрисовки ничего не делает: диалог подтверждения живёт в возвращаемом элементе.
 */
const rendersGuard = (source: string): boolean => {
  if (/<UnsavedChangesGuard\b/.test(source)) return true;
  const call = /const (\w+) = useUnsavedForm\(/.exec(source);
  if (!call) return false;
  const name = call[1];
  return new RegExp(`\\{${name}\\}`).test(source);
};

const FEATURES_ROOT = fromApp('src', 'features');

/** Экраны, где защита не нужна, — с ответом, почему. */
const WITHOUT_GUARD: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'src/features/assessment-admin/question-bank-detail-screen.tsx',
    why: 'на странице только отбор вопросов по типу; сами формы живут в панелях и защищены CMP-010'
  }
];

const walkTsx = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkTsx(full));
    else if (name.endsWith('.tsx') && !name.includes('.test.')) out.push(full);
  }
  return out;
};

interface PageForm {
  file: string;
  hasGuard: boolean;
}

const collectPageForms = (): PageForm[] => {
  const forms: PageForm[] = [];
  for (const file of walkTsx(FEATURES_ROOT)) {
    const source = readFileSync(file, 'utf8');
    /* Панель спрашивает сама — у неё свой сторож. */
    if (source.includes('DetailDrawer')) continue;
    if (!FIELD_MARKERS.test(source)) continue;
    if (!SAVE_MARKERS.test(source)) continue;
    forms.push({
      file: relative(APP_ROOT, file).replace(/\\/g, '/'),
      hasGuard: rendersGuard(source)
    });
  }
  return forms;
};

describe('страница с формой спрашивает перед уходом (ТЗ 10.3)', () => {
  const forms = collectPageForms();

  it('такие страницы вообще находятся — иначе сторож сторожит пустоту', () => {
    expect(forms.length).toBeGreaterThan(5);
  });

  it('у каждой страничной формы есть защита либо названная причина, почему не нужна', () => {
    const exempt = new Set(WITHOUT_GUARD.map((item) => item.file));
    const unguarded = forms
      .filter((form) => !form.hasGuard && !exempt.has(form.file))
      .map((form) => form.file);
    expect(
      unguarded,
      'Появилась страница с полем ввода и кнопкой сохранения, но без защиты от ухода. ' +
        'Либо добавьте useUnsavedForm(...), либо внесите её в WITHOUT_GUARD с ответом: ' +
        'почему потерять набранное здесь не страшно.'
    ).toEqual([]);
  });

  it('в списке исключений нет устаревших строк', () => {
    /*
     * Иначе список живёт своей жизнью: экран переименовали или защиту добавили, а строка
     * осталась — и следующая такая же страница проскочит под чужим оправданием.
     */
    const known = new Set(forms.map((form) => form.file));
    const stale = WITHOUT_GUARD.filter((item) => !known.has(item.file)).map((item) => item.file);
    expect(stale, 'Строка исключения больше ни к чему не относится — удалите её').toEqual([]);
  });

  it('у каждого исключения названа причина, а не просто имя файла', () => {
    for (const item of WITHOUT_GUARD) {
      expect(item.why.length, `${item.file}: причина не названа`).toBeGreaterThan(20);
    }
  });
});
