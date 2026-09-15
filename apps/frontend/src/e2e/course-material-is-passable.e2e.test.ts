import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Курс можно пройти: материал показывает материал (ТЗ 2.5.a / Б7, решение Р8).
 *
 * **Как было.** Из трёх базовых видов материала работал один. Текстовый урок печатал слушателю
 * «Текстовый материал станет доступен после расширения backend полем `textBody`» — название
 * поля базы данных вместо учебного текста. Материал-ссылка всегда сообщал «ссылка пока не
 * задана администратором», потому что получал жёстко переданный `null`: поля для адреса не
 * существовало, и задать его было НЕКУДА. Курс из таких материалов пройти было физически
 * нельзя, а прогресс «0 из 2» сдвинуть нечем.
 *
 * **Что закреплено.**
 *
 * 1. Просмотрщики берут содержимое из САМОГО материала, а не из заглушки: текст из `textBody`,
 *    адрес из `externalUrl`. Вернут `null` на место адреса — сторож покраснеет.
 * 2. На экране слушателя нет служебных слов. Проверка идёт по всем файлам просмотра курса, а
 *    не по одному: «убрали фразу в одном месте, забыли в соседнем» — самый частый способ
 *    вернуть этот дефект.
 */

const VIEWER_DIR = fromApp('src', 'features', 'course-viewer');

const viewerFiles = (): string[] =>
  readdirSync(VIEWER_DIR)
    .filter((entry) => entry.endsWith('.tsx') && !entry.includes('.test.'))
    .map((entry) => join(VIEWER_DIR, entry))
    .filter((full) => statSync(full).isFile());

/** Комментарии снимаем: пояснение «как было» в самом файле не должно ронять проверку. */
const codeOf = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/**
 * Слова, которых человек на экране видеть не должен, и что они выдают.
 *
 * Не «любая латиница» — в разметке её полно законно (`className`, `href`). Ловим ровно то,
 * что уже печаталось человеку, и общий признак: имя поля базы в тексте для показа.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /расширения backend/i, why: 'обещание доработки вместо учебного материала' },
  { pattern: /textBody<\/code>/, why: 'имя поля базы данных напечатано слушателю' },
  { pattern: /станет доступен после/i, why: 'обещание «потом» вместо ответа «что делать сейчас»' }
];

describe('материал курса можно пройти (ТЗ 2.5.a)', () => {
  it('сторож видит просмотрщики курса', () => {
    expect(
      viewerFiles().length,
      'каталог просмотра курса не найден — проверка смотрит в пустоту'
    ).toBeGreaterThan(5);
  });

  it('текстовый материал показывает текст материала', () => {
    const code = codeOf(join(VIEWER_DIR, 'text-viewer.tsx'));
    expect(
      /material\.textBody/.test(code),
      'текст обязан браться из самого материала: до этого здесь стояла заглушка с обещанием ' +
        'доработки, и текстовый урок пройти было нельзя'
    ).toBe(true);
  });

  it('материал-ссылка получает настоящий адрес, а не жёсткий null', () => {
    const code = codeOf(join(VIEWER_DIR, 'material-player.tsx'));
    const branch = code.slice(code.indexOf("case 'external_url'"), code.indexOf("case 'scorm'"));

    expect(branch.length, 'ветка внешней ссылки не найдена').toBeGreaterThan(0);
    expect(
      /externalUrl=\{material\.externalUrl/.test(branch),
      'адрес обязан браться из материала. Жёсткий `externalUrl={null}` заставлял экран винить ' +
        'администратора за незаполненное поле, которого не существовало'
    ).toBe(true);
  });

  it('ни один экран просмотра курса не говорит служебными словами', () => {
    const offenders: string[] = [];
    for (const file of viewerFiles()) {
      const code = codeOf(file);
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(code)) offenders.push(`${file.split('/').pop()}: ${why}`);
      }
    }

    expect(
      offenders,
      `на экране слушателя напечатано служебное:\n${offenders.join('\n')}\n` +
        'Правило продукта №2: ни одного сырого кода, имени поля или англицизма как значения.'
    ).toEqual([]);
  });
});
