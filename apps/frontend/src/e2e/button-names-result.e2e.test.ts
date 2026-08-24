import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `TXT-002` · кнопка называет результат, а не действие вообще.
 *
 * «Сохранить», «Создать», «Отправить», «Удалить» — это ответ на вопрос «что сделает
 * программа», а человеку нужен ответ на «что получится у меня». Разница видна, когда
 * человек вернулся к экрану через день: «Скачать» на пяти кнопках подряд не говорит,
 * какая из них даст нужный файл; «Скачать файл выгрузки» — говорит.
 *
 * Сторож ловит **голый глагол**: подпись состоит ровно из одного слова из списка ниже.
 * «Удалить вопрос», «Сохранить настройки оплаты», «Создать вебинар» проходят — там есть
 * объект. Исключения перечислены поимённо с причиной: правило не должно ломать те места,
 * где объект уже назван рядом и повтор мешал бы (витрина компонентов).
 *
 * ⚠️ Инвентарь для этого сторожа сначала **соврал**: поиск `<button[^>]*>` обрывался на
 * стрелке `=>` внутри `onClick`, и половина кнопок в отчёт не попадала — «Создать» в
 * вебинарах пришлось искать глазами. Отсюда разбор текстового узла перед закрывающим
 * тегом, а не разбор всего тега.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

/** Голый глагол: подпись из одного такого слова результат не называет. */
const BARE_VERBS = new Set([
  'Отправить',
  'Добавить',
  'Сохранить',
  'Создать',
  'Изменить',
  'Применить',
  'Готово',
  'ОК',
  'Ок',
  'Продолжить',
  'Открыть',
  'Подробнее',
  'Выбрать',
  'Загрузить',
  'Скачать',
  'Удалить',
  'Проверить',
  'Отметить',
  'Подтвердить',
  'Далее'
]);

/** Место → почему голый глагол здесь уместен. */
const EXPLAINED: Record<string, string> = {
  'src/features/ui-kit/gallery-screen.tsx :: Сохранить':
    'витрина компонентов дизайн-системы: кнопка показывает вид кнопки, а не выполняет работу — объект называть нечему'
};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (!full.endsWith('.tsx')) continue;
    if (full.includes('.test.')) continue;
    acc.push(full);
  }
  return acc;
};

/**
 * Подписи кнопок файла. Берётся текстовый узел перед закрывающим тегом (это устойчиво к
 * `=>` в атрибутах) и `label:` у действий шапки и строк реестра.
 */
const labelsOf = (source: string): string[] => {
  const out: string[] = [];
  for (const m of source.matchAll(/\n\s*([^<>{}\n]{2,40}?)\s*\n\s*<\/(?:button|Button)>/g)) {
    out.push((m[1] as string).trim());
  }
  for (const m of source.matchAll(/label:\s*'([^']+)'/g)) out.push((m[1] as string).trim());
  // Подпись-выражение: `{busy ? 'Загрузка…' : 'Загрузить'}`. Слепая зона первой версии
  // сторожа — её нашёл экран SCORM, где так пряталось сразу два нарушения: голый глагол
  // и подпись, меняющаяся по ходу (`TXT-003`).
  for (const m of source.matchAll(
    /\{[^{}]*\?\s*'([^']{2,40})'\s*:\s*'([^']{2,40})'[^{}]*\}\s*\n\s*<\/(?:button|Button)>/g
  )) {
    out.push((m[1] as string).trim(), (m[2] as string).trim());
  }
  return out;
};

describe('TXT-002 · кнопка называет результат', () => {
  const files = [join(FRONTEND, 'src'), join(FRONTEND, 'app')].flatMap((root) => collect(root));

  const bare = files.flatMap((file) => {
    const rel = relative(FRONTEND, file).split(sep).join('/');
    return labelsOf(readFileSync(file, 'utf8'))
      .filter((label) => BARE_VERBS.has(label))
      .map((label) => `${rel} :: ${label}`);
  });

  it('сторож видит экраны приложения', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('голого глагола на кнопке нет — либо объект в подписи, либо объяснение', () => {
    const unexplained = bare.filter((id) => !(id in EXPLAINED));

    expect(
      unexplained,
      `эти кнопки называют действие, а не результат:\n${unexplained.join('\n')}\n` +
        'Допишите объект («Удалить вопрос», «Сохранить настройки оплаты») или объясните в EXPLAINED.'
    ).toEqual([]);
  });

  it('в списке исключений нет устаревших строк', () => {
    const stale = Object.keys(EXPLAINED).filter((id) => !bare.includes(id));

    expect(
      stale,
      `эти подписи уже исправлены — вычеркните их из EXPLAINED:\n${stale.join('\n')}`
    ).toEqual([]);
  });
});
