import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * `TPL-002`: карточка объекта, которого нет, говорит об этом — а не притворяется живой.
 *
 * Что было. Экраны карточек писались в расчёте на то, что объект найдётся: заголовок брался
 * как `объект?.название ?? «Курс»`, разделы при отсутствии данных показывали свои пустые
 * состояния, а отказ сервера либо молча проглатывался, либо шёл строкой под шапкой. По ссылке
 * на удалённую запись (или на запись ЧУЖОГО учебного центра — сервер отвечает одинаково)
 * открывалась призрачная страница: заголовок на месте, разделы пусты, кнопка «Опубликовать
 * курс» нажимается и ничего не делает. Человек видит настоящую с виду карточку и не понимает,
 * почему в ней ничего нет.
 *
 * Правило: экран, принимающий идентификатор записи, обязан обработать её отсутствие.
 *
 * Почему проверяется наличие `RecordNotFound`, а не «какая-нибудь ветка»: у состояния должен
 * быть один вид на весь продукт, иначе «не найдено» окажется то заголовком, то строкой
 * ошибки, то пустым разделом — и человек каждый раз будет разбираться заново.
 */

const SOURCE = fromApp('src');

/** Признак экрана карточки: получает идентификатор записи пропом. */
const TAKES_ID = /\(\s*\{\s*id\s*\}\s*:\s*\{\s*id\s*:\s*string\s*\}/;

/**
 * Экраны, где отсутствие записи обработано ИНАЧЕ, с причиной у каждого. Список закрытый:
 * новый экран карточки без обработки красит проверку.
 */
const HANDLED_OTHERWISE: Record<string, string> = {
  'src/features/identity-verification/screens.tsx':
    'ранний возврат `if (error || !detail) return <SectionError…>`: заявка на проверку личности не имеет списка, куда возвращаться, — человек попадает сюда из очереди проверяющего',
  'src/features/proctoring/screens.tsx':
    'то же самое: запись прокторинга открывают из очереди, отдельного реестра записей нет',
  'src/features/learner-courses/screens.tsx':
    'экран — тонкая обёртка над `CourseViewerScreen`, и обработка живёт там, вместе с загрузкой курса'
};

const screens = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      screens(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Исходник без комментариев: пояснение про призрачные карточки — не обработка. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const detailScreens = screens(SOURCE)
  .map((file) => ({ name: relative(APP_ROOT, file), code: codeOnly(readFileSync(file, 'utf8')) }))
  .filter((f) => TAKES_ID.test(f.code));

describe('TPL-002 · карточка несуществующей записи не притворяется живой', () => {
  it('экраны карточек вообще найдены', () => {
    /* Сломайся признак — список опустеет, и запрет станет зелёным ни на чём. */
    expect(detailScreens.length).toBeGreaterThanOrEqual(6);
  });

  it('каждый экран карточки обрабатывает отсутствие записи', () => {
    const ghosts = detailScreens
      .filter((f) => !/<RecordNotFound\b/.test(f.code))
      .map((f) => f.name)
      .filter((name) => !(name in HANDLED_OTHERWISE));

    expect(
      ghosts,
      'карточка-призрак: по ссылке на удалённую или чужую запись откроется пустой экран с рабочими кнопками'
    ).toEqual([]);
  });

  it('список исключений не протухает — каждый файл всё ещё экран карточки', () => {
    const stale = Object.keys(HANDLED_OTHERWISE).filter(
      (name) => !detailScreens.some((f) => f.name === name)
    );
    expect(stale, 'исключение указывает на файл, который больше не карточка').toEqual([]);
  });
});
