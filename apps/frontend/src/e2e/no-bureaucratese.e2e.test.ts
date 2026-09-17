import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Без канцелярита и «отписок» (ТЗ «Стабилизация, UX и развитие», 4.4 / Я4).
 *
 * **Как было.** «Сценарий роли: Траектория администратора» — блок с тремя ссылками; описание
 * «Контроль доступов, рисков и операционного состояния LMS», шаг «Выполнить корректирующее
 * действие» — так никто не говорит. Сводка методиста: из четырёх блоков два сообщали «Нет
 * доступа к срокам обучения. Раздел виден ролям, которые ведут группы…» — первое, что видел
 * человек, входя в систему, было «вам сюда нельзя». Пустые состояния: «Выгрузки отсутствуют».
 *
 * **Что закреплено — три пункта ТЗ.**
 *
 * 1. Блок первых шагов называется «С чего начать»; «траекторий» и «сценариев роли» в текстах нет.
 * 2. Если роль не видит блок — блок не рендерится: заглушек «нет доступа» в текстах экранов
 *    нет вовсе (страница «Доступ запрещён» — другое: это закрытая страница, а не блок).
 * 3. Пустые состояния и подписи — без канцелярита и без «нет данных».
 *
 * Плюс 16.4: правила записаны в `docs/ui/tone-of-voice.md`, и документ ссылается на сторожей.
 */

const ROOTS = [
  fromApp('src', 'features'),
  fromApp('src', 'widgets'),
  fromApp('src', 'components'),
  fromApp('app'),
  fromPackages('ui', 'src')
];
const WORKSPACE = fromApp('app', 'workspace', 'page.tsx');
const HOME = fromApp('app', 'page.tsx');
const METHODIST = fromApp('src', 'features', 'methodist-home', 'methodist-home-screen.tsx');
const TONE_DOC = fromApp('..', '..', 'docs', 'ui', 'tone-of-voice.md');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      if (entry === 'styles' && full.includes('/packages/ui/src/')) continue;
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
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  for (const m of code.matchAll(/>([^<>{}]*[а-яё][^<>{}]*)</gi)) out.push(m[1]!);
  return out.filter((text) => /[а-яё]/i.test(text));
};

/*
 * «Отписка» — текст, который объясняет человеку, почему ему сюда нельзя, вместо того чтобы не
 * показывать блок. Страница «Доступ запрещён» и подписи прав в настройках под правило не
 * подпадают: там это ответ на действие, а не заглушка на стартовом экране.
 */
const ACCESS_STUBS =
  /[Нн]ет доступа к|[Нн]едостаточно прав|виден ролям|видят роли|не входит в ваши задачи|доступн[а-яё]* тем, кто/;

const BUREAUCRATESE: Array<{ wrong: RegExp; say: string }> = [
  { wrong: /[Сс]ценарий роли|[Тт]раектори[яи]/, say: '«С чего начать»' },
  { wrong: /в настоящее время/, say: '«сейчас»' },
  { wrong: /осуществля[а-яё]+/, say: '«идёт», «делает»' },
  { wrong: /(?<![а-яё])производится/, say: '«идёт»' },
  { wrong: /(?<![а-яё])является/, say: '«это»' },
  { wrong: /функционал[а-яё]*/, say: '«возможности», «раздел»' },
  { wrong: /(?<![а-яё])данн(ый|ая|ое|ого|ой|ом|ую)(?![а-яё])/, say: '«этот»' },
  { wrong: /(?<![а-яё])имеется|(?<![а-яё])имеются/, say: '«есть»' },
  { wrong: /отсутству[а-яё]+/, say: '«пока нет»' },
  { wrong: /не обнаружено/, say: '«пока нет»' },
  { wrong: /операционн[а-яё]+ состояни/, say: '«что горит»' },
  { wrong: /корректирующ[а-яё]+/, say: '«исправить»' },
  { wrong: /целесообразн[а-яё]*/, say: '«стоит»' },
  { wrong: /посредством/, say: '«через»' },
  { wrong: /надлежащ[а-яё]+/, say: '«нужный»' },
  { wrong: /в случае необходимости|при необходимости/, say: '«если нужно»' },
  {
    wrong: /(?<![а-яё])[Нн]ет данных|[Дд]анных нет|[Зз]аписей не найдено|[Зз]аписи отсутствуют/,
    say: '«пока нет» + что сделать'
  }
];

describe('без канцелярита и «отписок» (ТЗ 4.4)', () => {
  it('блок первых шагов называется «С чего начать» — на панели и на запасной главной', () => {
    for (const file of [WORKSPACE, HOME]) {
      const source = read(file);
      expect(source, rel(file)).toContain('title="С чего начать"');
      expect(/journey\.title|Сценарий роли/.test(source), `${rel(file)}: старое имя блока`).toBe(
        false
      );
    }
  });

  it('сводка методиста собирается из доступного: скрытый блок не рисуется', () => {
    const source = read(METHODIST);
    expect(/hidden\(/.test(source), 'признак скрытого блока обязан существовать').toBe(true);
    expect(
      ACCESS_STUBS.test(source),
      'заглушка «нет доступа» на стартовом экране — первое, что видит человек, это «вам сюда нельзя»'
    ).toBe(false);
    expect(
      /nothingToShow\s*\?/.test(source),
      'если по правам не доступно ничего — одно пустое состояние, а не пустая страница'
    ).toBe(true);
    expect(
      /subtitle:\s*`Групп в работе/.test(source),
      'подзаголовок — цифры, а не оправдание'
    ).toBe(true);
  });

  it('ни один экран не оправдывается за отсутствие доступа заглушкой', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      for (const text of userTextsOf(read(file))) {
        if (ACCESS_STUBS.test(text)) offenders.push(`${rel(file)}: «${text.slice(0, 70)}»`);
      }
    }
    expect(offenders, 'если роль не видит блок — блок не рендерится (ТЗ 4.4, п. 2)').toEqual([]);
  });

  it('тексты экранов — без канцелярита и без «нет данных»', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      for (const text of userTextsOf(read(file))) {
        for (const rule of BUREAUCRATESE) {
          const hit = rule.wrong.exec(text);
          if (hit)
            offenders.push(`${rel(file)}: «${hit[0]}» → ${rule.say} в «${text.slice(0, 60)}»`);
        }
      }
    }
    expect(offenders, 'так никто не говорит — правила в docs/ui/tone-of-voice.md').toEqual([]);
  });

  it('правила записаны в docs/ui/tone-of-voice.md и знают своих сторожей (16.4)', () => {
    expect(existsSync(TONE_DOC), 'документ обязан существовать').toBe(true);
    const doc = readFileSync(TONE_DOC, 'utf8');
    for (const section of [
      'Пустое состояние',
      'Нет доступа — нет блока',
      'Ошибка',
      'Кнопка и подтверждение'
    ]) {
      expect(doc, `раздел «${section}»`).toContain(`## ${section}`);
    }
    for (const guard of [
      'tone-of-voice',
      'yo-everywhere',
      'no-technical-words',
      'no-bureaucratese'
    ]) {
      expect(doc, `ссылка на сторожа ${guard}`).toContain(`\`${guard}\``);
    }
  });
});
