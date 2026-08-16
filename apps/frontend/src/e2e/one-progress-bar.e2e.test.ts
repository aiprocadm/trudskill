import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Одна полоса заполнения на всё приложение (`CMP-*`: компонент берётся из `@trudskill/ui`,
 * а не пишется на экране).
 *
 * Сверка перед срезом 22 нашла **восемь** самодельных полос: шесть через голый `<progress>`
 * и две нарисованные блоками с инлайновыми цветами прямо в разметке экрана. Выглядели они
 * по-разному, а тон (зелёный / жёлтый / красный) знала только одна.
 *
 * Сторож — очередь: падает на НОВОЙ самодельной полосе и требует пометку волны у каждой
 * известной. Инлайновые цвета вдобавок невидимы сторожу дисциплины токенов — он читает
 * строку стилей пакета, а не разметку экранов (та же слепая зона, что у styled-jsx).
 */

const ROOTS = [fromApp('src'), fromApp('app')];
/** Голый `<progress>` и руками собранная полоса `role="progressbar"`. */
const HANDMADE = /<progress\b|role="progressbar"/;

/** Известные места на момент среза 22 — все в кабинетах слушателя, это волна 6. */
const KNOWN: Record<string, string> = {
  'src/features/test-player/test-attempt-screen.tsx':
    'волна 6: прохождение теста — сколько отвечено',
  'src/features/learner-home/my-courses-list.tsx': 'волна 6: кабинет слушателя — прогресс по курсу',
  'src/features/course-viewer/course-viewer-screen.tsx': 'волна 6: просмотр курса — общий прогресс',
  'src/features/mvp/screens.tsx': 'волна 6: остаток монолита — прогресс по курсу у слушателя'
};

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

describe('одна полоса заполнения на приложение (очередь редизайна)', () => {
  const offenders = ROOTS.flatMap((root) => collect(root))
    .filter((file) => HANDMADE.test(readFileSync(file, 'utf8')))
    .map((file) => relative(APP_ROOT, file).replace(/\\/g, '/'))
    .sort();

  it('новых самодельных полос не появилось', () => {
    const unexpected = offenders.filter((file) => !(file in KNOWN));
    expect(
      unexpected,
      'полоса заполнения рисуется на экране — возьмите ProgressBar из @trudskill/ui'
    ).toEqual([]);
  });

  it('очередь не содержит уже исправленных мест — иначе список врёт', () => {
    const fixed = Object.keys(KNOWN).filter((file) => !offenders.includes(file));
    expect(fixed, 'место исправлено — уберите его из списка сторожа').toEqual([]);
  });

  it('у каждого места в очереди указана волна', () => {
    const withoutWave = Object.entries(KNOWN)
      .filter(([, note]) => !note.includes('волна'))
      .map(([file]) => file);
    expect(withoutWave).toEqual([]);
  });

  /*
   * Иначе сторож стал бы зелёным, если общий компонент просто перестанут применять:
   * «самодельных полос нет» и «полос нет вообще» выглядели бы одинаково.
   */
  it('общая полоса действительно используется экранами', () => {
    const users = ROOTS.flatMap((root) => collect(root)).filter((file) =>
      /<ProgressBar\b/.test(readFileSync(file, 'utf8'))
    );
    expect(users.length).toBeGreaterThanOrEqual(4);
  });
});
