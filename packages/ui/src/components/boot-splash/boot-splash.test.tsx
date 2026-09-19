import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BootSplash } from './index.js';

/**
 * Экран загрузки приложения (ТЗ «Стабилизация, UX и развитие», 7.3 / В3).
 *
 * **Что было.** Серый прямоугольник «Проверяем сессию…» в левом верхнем углу пустой белой
 * страницы. Человек видел это на каждом входе и после каждого обновления вкладки. Выглядело
 * не как загрузка, а как сломанная страница — и на медленной сети висело секундами, за
 * которые человек успевал решить, что система не работает, и нажать обновление ещё раз
 * (журнал 564).
 *
 * **Что закреплено.** Страница занята целиком, в ней логотип и КАРКАС будущего содержимого.
 * Движения нет (`UI-029`). Каркас рисуется только там, где он действительно появится: на
 * входе бокового меню не будет, и обещать его нечестно.
 */

const here = dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(resolve(here, '..', '..', 'styles', 'foundation.ts'), 'utf8');
const bootRule = styles.slice(styles.indexOf('.ui-boot {'), styles.indexOf('.ui-boot__mark'));

const render = (element: ReturnType<typeof BootSplash>) => JSON.stringify(element);

describe('экран загрузки занимает страницу целиком (ТЗ 7.3)', () => {
  it('высота — во весь экран, а не прямоугольник в углу', () => {
    /*
     * `100dvh`, а не `100vh`: на телефоне адресная строка браузера то появляется, то
     * исчезает, и `100vh` на это не реагирует — экран загрузки вылезал бы за край.
     */
    expect(bootRule).toMatch(/min-height:\s*100dvh/);
  });

  it('фон задан — иначе это лист белой бумаги', () => {
    expect(bootRule).toMatch(/background:\s*var\(--ui-bg\)/);
  });

  it('скелетон не движется (UI-029)', () => {
    /*
     * Мерцание не заканчивается никогда, а смысл скелетона в том, что он показывает ФОРМУ
     * будущего содержимого. Людям с вестибулярными нарушениями непрерывное движение мешает
     * физически.
     */
    const whole = styles.slice(styles.indexOf('.ui-boot {'), styles.indexOf('.ui-code-block'));
    expect(whole, 'в экран загрузки вернулась анимация').not.toMatch(/animation:/);
  });
});

describe('каркас обещает только то, что появится (ТЗ 7.3)', () => {
  it('на странице приложения рисуется меню, шапка и таблица', () => {
    const markup = render(BootSplash({}));
    expect(markup).toContain('ui-boot__sidebar');
    expect(markup).toContain('ui-boot__topbar');
    expect(markup).toContain('ui-boot__table');
  });

  it('на входе каркаса нет — меню там не появится', () => {
    /* Нарисовать боковое меню на странице входа значит пообещать то, чего не будет. */
    const markup = render(BootSplash({ frame: 'plain' }));
    expect(markup).not.toContain('ui-boot__sidebar');
    expect(markup, 'знак и подпись остаются').toContain('ui-boot__logo');
  });

  it('на телефоне меню-скелетон скрыт', () => {
    const phone = styles.slice(styles.indexOf('.ui-boot__line--short'));
    expect(phone).toMatch(/\.ui-boot__sidebar\s*{\s*display:\s*none/);
  });
});

describe('экран загрузки говорит человеческим языком (ТЗ 7.3)', () => {
  it('подпись объясняет, что происходит', () => {
    expect(render(BootSplash({}))).toContain('Загружаем рабочее место');
  });

  it('читалке экрана сообщается один раз, полосы от неё скрыты', () => {
    /*
     * Иначе она зачитала бы каждую декоративную полосу отдельно: «загрузка, загрузка,
     * загрузка» одиннадцать раз подряд.
     */
    const markup = render(BootSplash({}));
    expect(markup).toContain('"role":"status"');
    expect(markup).toContain('"aria-busy":"true"');
    /*
     * Скрыт должен быть именно КАРКАС. Проверять одно слово `aria-hidden` мало: оно есть и у
     * логотипа, и проверка проходила бы, даже если полосы читалке видны — подсадкой поймано.
     */
    expect(markup, 'каркас не скрыт от читалки экрана').toContain(
      '"className":"ui-boot__frame","aria-hidden":true'
    );
  });
});
