import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { focusReturnTarget } from './focus.js';

/**
 * Фокус возвращается туда, откуда открыли (ТЗ «Стабилизация, UX и развитие», 14.1, пункт 1).
 *
 * **Что было.** Всплывающие слои умели ловить фокус внутри себя и закрываться по Esc — но при
 * закрытии фокус не возвращался НИКУДА. Он оставался на исчезнувшем элементе, и браузер
 * отправлял его на начало страницы. Человеку с мышью это незаметно. Тому, кто работает с
 * клавиатуры, — нет: открыл карточку из сороковой строки таблицы, закрыл, и чтобы вернуться к
 * той же строке, надо сорок раз нажать Tab. На каждой такой операции (журнал 569).
 *
 * **Что закреплено.** Слой запоминает, откуда его открыли, и при закрытии возвращает фокус
 * туда же — если кнопка-источник ещё на странице.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, 'focus.ts'), 'utf8');

/** Подделка элемента: настоящий DOM здесь не нужен, правило зависит от двух признаков. */
const fakeElement = (overrides: Partial<HTMLElement> = {}): HTMLElement =>
  ({ isConnected: true, focus: () => {}, ...overrides }) as unknown as HTMLElement;

describe('куда вернуть фокус (ТЗ 14.1)', () => {
  it('на кнопку-источник, если она на месте', () => {
    const button = fakeElement();
    expect(focusReturnTarget(button)).toBe(button);
  });

  it('никуда, если кнопки-источника на странице больше нет', () => {
    /*
     * Так бывает, когда действие в слое удалило ту самую строку, из которой слой открыли.
     * Вызвать `focus()` на исчезнувшем элементе значит отправить фокус на начало страницы —
     * то есть ровно туда, откуда мы человека и уводим.
     */
    expect(focusReturnTarget(fakeElement({ isConnected: false }))).toBeNull();
  });

  it('никуда, если возвращать нечему', () => {
    /* Слой могли открыть не с клавиатуры — тогда запоминать было нечего. */
    expect(focusReturnTarget(null)).toBeNull();
    expect(focusReturnTarget(undefined)).toBeNull();
  });

  it('никуда, если элемент фокус не принимает', () => {
    /*
     * `document.activeElement` возвращает и `body`, у которого в некоторых средах метода
     * фокусировки попросту нет. Падать из-за этого при каждом закрытии окна нельзя.
     */
    expect(
      focusReturnTarget(fakeElement({ focus: undefined as unknown as HTMLElement['focus'] }))
    ).toBeNull();
  });
});

describe('слой действительно возвращает фокус, а не только умеет (ТЗ 14.1)', () => {
  it('источник запоминается при открытии', () => {
    expect(source, 'слой не запоминает, откуда его открыли').toMatch(
      /returnTo\.current = document\.activeElement/
    );
  });

  it('фокус возвращается при закрытии', () => {
    /*
     * Проверяем постройку «в уборке за собой вызывается возврат», а не наличие слова:
     * упоминание функции в комментарии или в импорте ничего не доказывает.
     */
    expect(source).toMatch(/focusReturnTarget\(returnTo\.current\)[\s\S]{0,120}\?\.focus\(\)/);
  });

  it('Esc закрывает слой, а страница под ним не прокручивается', () => {
    expect(source).toMatch(/event\.key === 'Escape'/);
    expect(source).toMatch(/document\.body\.style\.overflow = 'hidden'/);
  });

  it('прокрутка страницы восстанавливается прежней, а не задаётся заново', () => {
    /*
     * Если после закрытия слоя жёстко написать «прокрутка разрешена», то слой поверх слоя
     * разблокирует страницу, хотя верхний ещё открыт. Поэтому прежнее значение запоминается.
     */
    expect(source).toMatch(/const prevOverflow = document\.body\.style\.overflow/);
    expect(source).toMatch(/document\.body\.style\.overflow = prevOverflow/);
  });
});

describe('выпадающие меню ведут себя как меню (ТЗ 14.1, пункт 3)', () => {
  const menu = readFileSync(resolve(here, '..', 'header-menu', 'index.tsx'), 'utf8');
  const pageShell = readFileSync(
    resolve(here, '..', '..', 'composition', 'page-shell.tsx'),
    'utf8'
  );

  it('Esc закрывает меню', () => {
    /*
     * Родной раскрывающийся блок браузера по Esc НЕ закрывается. Человек с клавиатуры
     * оказывался заперт: привычное «отменить» не срабатывало, и чтобы закрыть меню,
     * приходилось прощёлкивать Tab до его заголовка и жать пробел (журнал 570).
     */
    expect(menu).toMatch(/event\.key === 'Escape'/);
    expect(menu).toMatch(/element\.open = false/);
  });

  it('после Esc фокус возвращается на заголовок меню', () => {
    /* То же правило, что у всплывающих слоёв: человек остаётся там, откуда пришёл. */
    expect(menu).toMatch(/returnFocus[\s\S]{0,200}querySelector\('summary'\)\?\.focus\(\)/);
  });

  it('клик мимо закрывает, но фокус не утаскивает', () => {
    /* Человек уже показал мышью, куда смотрит: тащить фокус обратно значит мешать ему. */
    expect(menu).toMatch(/pointerdown/);
    expect(menu, 'клик мимо не должен возвращать фокус').toMatch(/close\(false\)/);
    expect(menu, 'Esc должен возвращать фокус').toMatch(/close\(true\)/);
  });

  it('меню действий страницы собрано из общего компонента', () => {
    /*
     * Таких меню в продукте два — в шапке приложения и в заголовке страницы. Скопированная
     * механика расходится молча: в одном месте Esc работает, в другом нет, и замечает это
     * только тот, кому она нужна.
     */
    expect(pageShell, 'меню собрано вручную вместо общего компонента').not.toMatch(
      /<details className="ui-header-menu/
    );
    expect(pageShell).toMatch(/<HeaderMenu/);
  });
});

describe('все всплывающие слои берут механику отсюда (ТЗ 14.1)', () => {
  /*
   * Раньше ловушка фокуса жила внутри `Modal`, и с появлением второго слоя её скопировали.
   * Две копии одной механики расходятся молча: в одной фокус возвращается, в другой нет — и
   * человек замечает разницу, а никто из разработчиков не замечает.
   */
  const OVERLAYS = [
    ['components', 'dialogs', 'index.tsx'],
    ['components', 'detail-drawer', 'index.tsx']
  ];

  it.each(OVERLAYS)('%s/%s/%s пользуется общим модулем', (...parts) => {
    const file = readFileSync(resolve(here, '..', '..', ...parts), 'utf8');
    expect(file).toMatch(/useOverlayFocus\(/);
    expect(file).toMatch(/useOverlayEscapeAndScrollLock\(/);
    expect(file, 'у слоя завелась своя ловушка фокуса вместо общей').not.toMatch(
      /addEventListener\('keydown'/
    );
  });
});
