import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import { PAYMENT_PROVIDER_CODES, PAYMENT_PROVIDER_LABELS } from '../features/payments/types';
import { SMS_PROVIDER_CODES, SMS_PROVIDER_LABELS } from '../features/sms/api';
import { PROVIDER_NAMES_RU, providerLabels } from '../features/texts/providers.ru';
import {
  VIDEO_PROVIDER_CODES,
  VIDEO_PROVIDER_LABELS
} from '../features/video-upload/provider-settings.api';

/**
 * Технических слов на экранах нет (ТЗ «Стабилизация, UX и развитие», 4.2 / Я2).
 *
 * **Как было.** Список площадок вебинаров печатал коды как есть: `noop`, `fake`, `jitsi`,
 * `pruffme`, `bbb`; «Текущий: noop». Оплата подписывала «Отключено (noop)» — код в скобках.
 * Виджет обещал «интеграционные джобы», карточка курса — «Шаблоны привязаны к tenant», экран
 * арендаторов — «аудит целевого тенанта», сервер — «У политики тенанта…». Тег бланка
 * `{%tenant.signature_image}` человек должен был перепечатать в документ руками.
 *
 * **Что закреплено.** Три вещи из ТЗ:
 *
 * 1. В выпадающих списках — имена из одного словаря (`texts/providers.ru.ts`); техническое
 *    значение остаётся в коде и в запросах.
 * 2. «Тенант» и «джобы» не встречаются в текстах для человека — ни на экранах, ни в
 *    сообщениях сервера. Ищутся в строках и между тегами разметки, комментарии сняты.
 * 3. Тег бланка — кнопкой «Скопировать тег» с пояснением, а голым текстом — только когда
 *    буфера обмена нет.
 */

const ROOTS = [
  fromApp('src', 'features'),
  fromApp('src', 'widgets'),
  fromApp('src', 'components'),
  fromApp('app'),
  fromPackages('ui', 'src')
];
const BACKEND_MODULES = fromApp('..', 'backend', 'src', 'modules');
const WEBINARS_SCREEN = fromApp('src', 'features', 'webinars', 'screens.tsx');
const WEBINARS_TYPES = fromApp('src', 'features', 'webinars', 'types.ts');
const TENANT_IMAGES = fromApp('src', 'features', 'tenant-images', 'screens.tsx');
const UI_INDEX = fromPackages('ui', 'src', 'index.tsx');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Строки и текст между тегами — то, что человек может прочитать. */
const userTextsOf = (code: string): string[] => {
  const out: string[] = [];
  for (const m of code.matchAll(
    /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  )) {
    const text = m[1] ?? m[2] ?? m[3] ?? '';
    if (text.trim()) out.push(text);
  }
  for (const m of code.matchAll(/>([^<>{}]*[а-яё][^<>{}]*)</gi)) out.push(m[1]!);
  return out;
};

/*
 * `tenant` внутри русского текста — техническое слово; `${tenant.name}` и `tenant.` — код,
 * не текст. «Тенант» и «джоб» по-русски бывают только в тексте для человека.
 */
const TECHNICAL_WORDS: Array<{ name: string; test: RegExp }> = [
  { name: '«тенант»', test: /[Тт]енант/ },
  { name: '«джобы»', test: /[Дд]жоб/ },
  {
    name: 'tenant в русской фразе',
    test: /[А-Яа-яё][^\n]{0,40}(?<![\w$.{])tenant(?![\w.])|(?<![\w$.{])tenant(?![\w.])[^\n]{0,40}[А-Яа-яё]/i
  },
  { name: 'код в скобках', test: /\((noop|fake|jitsi|pruffme|bbb)\)/ }
];

describe('технических слов на экранах нет (ТЗ 4.2)', () => {
  it('словарь поставщиков называет коды словами, а не кодами', () => {
    for (const [code, name] of Object.entries(PROVIDER_NAMES_RU)) {
      /* Имя сервиса может совпадать с кодом по буквам («Jitsi» / `jitsi`) — но не быть им. */
      expect(name, code).not.toBe(code);
      expect(name, `${code}: код не должен просачиваться в имя`).not.toMatch(/\b(noop|fake)\b/i);
    }
    expect(PROVIDER_NAMES_RU.noop).toBe('Отключено');
    expect(PROVIDER_NAMES_RU.fake).toBe('Тестовый режим');
  });

  it('все четыре списка берут подписи из одного словаря — и словарь без мёртвых записей', () => {
    expect(SMS_PROVIDER_LABELS).toEqual(providerLabels(SMS_PROVIDER_CODES));
    expect(VIDEO_PROVIDER_LABELS).toEqual(providerLabels(VIDEO_PROVIDER_CODES));
    expect(PAYMENT_PROVIDER_LABELS).toEqual(providerLabels(PAYMENT_PROVIDER_CODES));

    const webinarCodes = [
      ...(/WebinarProviderCode\s*=([^;]+);/.exec(read(WEBINARS_TYPES))?.[1] ?? '').matchAll(
        /'([a-z]+)'/g
      )
    ].map((m) => m[1]!);
    expect(
      webinarCodes.length,
      'коды площадок вебинаров обязаны читаться из types.ts'
    ).toBeGreaterThan(3);
    const used = new Set([
      ...SMS_PROVIDER_CODES,
      ...VIDEO_PROVIDER_CODES,
      ...PAYMENT_PROVIDER_CODES,
      ...webinarCodes
    ]);
    expect([...used].sort(), 'код без имени в словаре').toEqual(
      Object.keys(PROVIDER_NAMES_RU).sort()
    );
  });

  it('список площадок вебинаров печатает имя, а не код — и в выборе, и в строках', () => {
    const source = read(WEBINARS_SCREEN);
    expect(/<option[^>]*>\s*\{p\}/.test(source), 'в выпадающем списке голый код').toBe(false);
    expect(
      /\{settings\.providerCode\}|\$\{w\.providerCode\}/.test(source),
      'код площадки печатается как значение'
    ).toBe(false);
    expect(/providerNameRu\(|WEBINAR_PROVIDER_LABELS\[/.test(source)).toBe(true);
  });

  it('ни один экран не говорит «тенант», «джобы» и tenant по-русски', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      for (const text of userTextsOf(read(file))) {
        for (const word of TECHNICAL_WORDS) {
          if (word.test.test(text))
            offenders.push(`${rel(file)}: ${word.name} — «${text.slice(0, 60)}»`);
        }
      }
    }
    expect(offenders, '«тенант» → «учебный центр», «джобы» → «фоновые задачи» (ТЗ 4.2)').toEqual(
      []
    );
  });

  it('сообщения сервера — на языке человека, без «тенанта» и «джобов»', () => {
    const offenders: string[] = [];
    for (const file of collect(BACKEND_MODULES)) {
      const source = read(file);
      for (const m of source.matchAll(/message:\s*'([^']*)'/g)) {
        if (/[Тт]енант|[Дд]жоб/.test(m[1]!))
          offenders.push(`${rel(file)}: «${m[1]!.slice(0, 60)}»`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('тег бланка — кнопкой «Скопировать тег» с пояснением, голым текстом — только без буфера', () => {
    const source = read(TENANT_IMAGES);
    expect(/<CopyButton\b/.test(source), 'тег копируется кнопкой').toBe(true);
    expect(source).toContain('label="Скопировать тег"');
    expect(source).toMatch(/подставится подпись/);
    expect(source).toMatch(/подставится печать/);
    expect(/Тег для бланка:/.test(source), 'тег голым текстом в подписи').toBe(false);
    expect(
      /Буфер обмена недоступен[^<]*<code>\{tag\}<\/code>/.test(source),
      'без буфера обмена человек всё равно должен получить тег'
    ).toBe(true);

    /* Голый тег `{%…}` в разметке или строках — только значение для кнопки в этом экране. */
    const elsewhere: string[] = [];
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      if (file === TENANT_IMAGES) continue;
      if (userTextsOf(read(file)).some((text) => text.includes('{%'))) elsewhere.push(rel(file));
    }
    expect(elsewhere).toEqual([]);
    expect(/>\s*\{%/.test(source), 'тег между тегами разметки — голый текст').toBe(false);
  });

  it('кнопка копирования — в общем пакете, а не написана в экране', () => {
    expect(read(UI_INDEX)).toContain("export * from './components/copy-button/index.js'");
  });
});
