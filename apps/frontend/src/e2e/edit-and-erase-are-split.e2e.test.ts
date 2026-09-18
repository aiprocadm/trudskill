import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';

/**
 * Правка и уничтожение разведены (ТЗ «Стабилизация, UX и развитие», 5.13 / Э13).
 *
 * **Как было.** Боковая панель карточки слушателя держала форму профиля, а сразу под ней —
 * блок «Обезличивание данных (152-ФЗ)» с пометкой «необратимо». Человек прокручивал вниз к
 * кнопке «Сохранить слушателя» — и проезжал мимо необратимой операции (журнал 487). Сама
 * кнопка при этом не была закреплена: до неё надо было докручивать.
 *
 * **Что закреплено.**
 *
 * 1. Обезличивание живёт на своей вкладке карточки, а не под формой.
 * 2. «Сохранить» и «Отмена» — в закреплённом низу панели; до них не надо прокручивать.
 * 3. «Сохранить» показывается только там, где есть что сохранять.
 * 4. Механизм подтверждения набором слова «обезличить» НЕ тронут — ТЗ велит использовать
 *    его как образец (5.3), а не переделывать.
 */

const DRAWER = fromApp('src', 'features', 'learners', 'learner-edit-drawer.tsx');
const PII = fromApp('src', 'features', 'learners', 'learner-pii-panel.tsx');
const DRAWER_COMPONENT = fromPackages('ui', 'src', 'components', 'detail-drawer', 'index.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Тело `<TabPanel id="…" …>` до закрывающего тега. */
const tabPanel = (source: string, id: string): string => {
  const at = source.indexOf(`<TabPanel id="${id}"`);
  if (at === -1) return '';
  const end = source.indexOf('</TabPanel>', at);
  return end === -1 ? '' : source.slice(at, end);
};

/**
 * Значение свойства `footer={ … }` по балансу фигурных скобок.
 *
 * Имя ищется С ГРАНИЦЕЙ: `footer={` содержится внутри `data-footer={`, и подсаженная
 * поломка «кнопки вернулись в поток формы» прошла мимо первой редакции замера (журнал 489).
 * Тот же класс, что 471: проверка подстрокой ловится на приставке.
 */
const footerSlot = (source: string): string => {
  const at = source.search(/(?<![\w-])footer=\{/);
  if (at === -1) return '';
  let depth = 0;
  let j = source.indexOf('{', at);
  for (let i = j; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        j = i;
        break;
      }
    }
  }
  return source.slice(at, j + 1);
};

describe('правка и уничтожение разведены (ТЗ 5.13)', () => {
  it('обезличивание живёт на своей вкладке, а не под формой', () => {
    const source = read(DRAWER);
    const erase = tabPanel(source, 'erase');
    expect(erase, 'вкладка обезличивания обязана существовать').not.toBe('');
    expect(erase, 'панель обезличивания — внутри своей вкладки').toContain('<LearnerPiiPanel');

    const profile = tabPanel(source, 'profile');
    expect(profile, 'вкладка данных обязана существовать').not.toBe('');
    expect(
      /<LearnerPiiPanel/.test(profile),
      'необратимое рядом с формой — это и есть дефект ТЗ 5.13'
    ).toBe(false);
  });

  it('«Сохранить» и «Отмена» — в закреплённом низу панели', () => {
    /*
     * Возможность у панели была и раньше, ею пользовался один экран из тридцати
     * (журнал 488): кнопки стояли в потоке формы, и до них приходилось прокручивать.
     */
    const footer = footerSlot(read(DRAWER));
    expect(footer, 'низ панели обязан быть задан').not.toBe('');
    expect(footer).toContain('DrawerCancelButton');
    expect(footer).toContain('Сохранить слушателя');
  });

  it('кнопка отправки снаружи формы связана с ней по идентификатору', () => {
    // Без `form="..."` кнопка в низу панели не отправила бы форму вовсе.
    const source = read(DRAWER);
    expect(source).toContain('id={FORM_ID}');
    expect(footerSlot(source)).toContain('form={FORM_ID}');
  });

  it('«Сохранить» не показывается там, где сохранять нечего', () => {
    // Э2: кнопка, которая ничего не сделает, обещает несуществующее действие.
    expect(footerSlot(read(DRAWER))).toContain("tab === 'profile'");
  });

  it('низ панели держится сам, а не прокручивается вместе с телом', () => {
    const component = read(DRAWER_COMPONENT);
    expect(component).toContain('ui-drawer__footer');
    expect(component, 'тело панели прокручивается отдельно').toContain('ui-drawer__body');
  });

  it('механизм подтверждения набором слова НЕ тронут', () => {
    /*
     * ТЗ 5.13 прямо велит его не трогать и использовать как образец. Сторож фиксирует это
     * как инвариант: подтверждение обезличивания — набрать слово, а не нажать «ОК».
     */
    const source = read(PII);
    expect(source).toContain('обезличить');
    expect(
      /confirm\.trim\(\)\.toLowerCase\(\) !== 'обезличить'/.test(source),
      'кнопка остаётся выключенной, пока слово не набрано'
    ).toBe(true);
    expect(source, 'последствие названо словами').toContain('необратимо');
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э13');
    expect(doc).toContain('footer');
  });
});
