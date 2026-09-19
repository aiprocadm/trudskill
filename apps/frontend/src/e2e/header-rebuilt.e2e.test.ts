import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import {
  initialsOf,
  profileHref,
  unreadBadge,
  unreadLabel,
  userMenuItems
} from '../features/navigation/user-menu';

import type { UserSession } from '../entities/session/model';

/**
 * Шапка перестроена (ТЗ «Стабилизация, UX и развитие», 7.1 / В1).
 *
 * **Как было.** Самым заметным элементом шапки была кнопка «Выйти» — ЕДИНСТВЕННАЯ обведённая
 * кнопка на странице. Интерфейс каждым экраном предлагал уйти. «Уведомления» стояли ссылкой,
 * неотличимой от подписи: счётчик непрочитанных терялся. Переключатель темы занимал место на
 * КАЖДОЙ странице, хотя тему меняют раз в жизни. Имя человека было серым мёртвым текстом
 * (журнал 558).
 *
 * **Что закреплено.**
 *
 * 1. Справа — человек: инициалы и имя, за ними меню «Профиль», «Оформление», «Выйти».
 * 2. Уведомления — колокольчик со счётчиком, с полной подписью для читалки экрана.
 * 3. Выход больше не обведённая кнопка шапки: он пункт меню, помеченный опасным.
 * 4. Оформление меняется ИЗ ШАПКИ, но шапку не занимает (`UI-026` уточнён, журнал 559).
 */

const sessionOf = (roles: string[], displayName: string): UserSession =>
  ({
    user: {
      id: 'u1',
      tenantId: 't1',
      login: 'l',
      email: null,
      status: 'active',
      displayName
    },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles,
    permissions: []
  }) as unknown as UserSession;

const shell = stripComments(
  readFileSync(fromApp('src', 'widgets', 'shell', 'app-shell.tsx'), 'utf8')
);

describe('меню человека вместо кнопки «Выйти» (ТЗ 7.1)', () => {
  it('состав меню — ровно тот, что назвало ТЗ', () => {
    expect(
      userMenuItems(sessionOf(['tenant_admin'], 'Иванов Пётр')).map((item) => item.label)
    ).toEqual(['Профиль', 'Оформление', 'Выйти']);
  });

  it('выход помечен опасным и стоит последним', () => {
    /*
     * Не потому, что необратим, а потому, что случайное нажатие стоит человеку работы: он
     * теряет несохранённое и вводит пароль заново.
     */
    const items = userMenuItems(sessionOf(['tenant_admin'], 'А Б'));
    expect(items[items.length - 1]?.id).toBe('logout');
    expect(items.find((item) => item.id === 'logout')?.danger).toBe(true);
  });

  it('«Выйти» больше не обведённая кнопка шапки', () => {
    /* Прежде это была единственная кнопка на странице — интерфейс предлагал уйти. */
    const bar = shell.slice(shell.indexOf('app-shell__userbar'));
    expect(bar, 'выход живёт пунктом меню, а не кнопкой').not.toMatch(
      /className="ui-button"[\s\S]{0,400}Выйти/
    );
    expect(bar).toContain('ui-header-menu__item--danger');
  });

  it('профиль ведёт туда, куда человека пустят', () => {
    /*
     * У слушателя свой кабинет, у сотрудника профиль живёт вкладкой настроек. Один пункт на
     * всех отправил бы половину людей на «доступ запрещён».
     */
    expect(profileHref(sessionOf(['learner'], 'Учащийся'))).toBe('/learner/profile');
    expect(profileHref(sessionOf(['tenant_admin'], 'Админ'))).toBe('/settings?tab=profile');
    expect(
      profileHref(sessionOf(['learner', 'teacher'], 'И тот и другой')),
      'сотрудник со второй ролью слушателя — всё равно сотрудник'
    ).toBe('/settings?tab=profile');
  });
});

describe('инициалы вместо серого текста (ТЗ 7.1)', () => {
  it('берутся две первые буквы слов', () => {
    expect(initialsOf('Иванов Пётр')).toBe('ИП');
    expect(initialsOf('иванов пётр сергеевич'), 'третье слово не берётся').toBe('ИП');
  });

  it('одно слово даёт одну букву, пустое — ничего', () => {
    /* Выдумывать вторую букву неоткуда, а знак вопроса в кружке ничего не объясняет. */
    expect(initialsOf('Администратор')).toBe('А');
    expect(initialsOf('')).toBe('');
    expect(initialsOf(undefined)).toBe('');
    expect(initialsOf('   ')).toBe('');
  });

  it('кружок не рисуется, когда инициалов нет', () => {
    expect(shell).toContain('initials ?');
  });
});

describe('поиск — главный инструмент шапки (ТЗ 7.1)', () => {
  const styles = stripComments(
    readFileSync(fromPackages('ui', 'src', 'styles', 'shell.ts'), 'utf8')
  );
  /*
   * Берём РОВНО блок `.app-shell__search`, до ближайшей закрывающей скобки. Взяв кусок пошире,
   * сторож находил `flex: 1 1 auto` у СОСЕДНЕЙ `.app-shell__search-label` и пропускал поломку
   * самой кнопки — проверено подсадкой.
   */
  const searchStart = styles.indexOf('.app-shell__search {');
  const search = styles.slice(searchStart, styles.indexOf('}', searchStart));
  const phone = styles.slice(styles.indexOf('@media (max-width: 480px)'));

  it('поиск тянется, а не жмётся кнопкой у края', () => {
    /*
     * `flex: 1 1 auto` внутри правой группы отдаёт поиску всё свободное место. Без него он
     * оставался бы шириной по содержимому — мелкой кнопкой рядом со значками, какой и был.
     */
    expect(search).toMatch(/flex:\s*1 1 auto/);
    expect(search, 'но не растекается во всю шапку на широком мониторе').toMatch(
      /max-width:\s*360px/
    );
  });

  it('на телефоне остаётся значок с тач-зоной 44×44', () => {
    /*
     * Широкое поле на 360px съело бы шапку и дало горизонтальную прокрутку (ФТ-H4). Слово и
     * подсказка клавиш там не нужны: клавиатуры на телефоне нет.
     */
    expect(phone).toMatch(/\.app-shell__search\s*{[^}]*min-width:\s*44px/);
    expect(phone).toMatch(/\.app-shell__search-label,\s*\.app-shell__kbd\s*{\s*display:\s*none/);
  });

  it('без слова на экране поиск всё равно назван читалке', () => {
    /* На телефоне видна одна лупа — слушающий экран человек обязан узнать, что это. */
    expect(shell).toMatch(/className="app-shell__search"[\s\S]{0,400}aria-label="Поиск/);
  });
});

describe('уведомления — колокольчик со счётчиком (ТЗ 7.1)', () => {
  it('на значке число, а в подписи — что это за число', () => {
    /* «Три» рядом со значком не отвечает на вопрос «три чего» тому, кто слушает экран. */
    expect(unreadBadge(3)).toBe('3');
    expect(unreadLabel(3)).toContain('непрочитанных 3');
    expect(unreadLabel(0)).toContain('непрочитанных нет');
  });

  it('больше девяноста девяти — это уже «много»', () => {
    expect(unreadBadge(100)).toBe('99+');
    expect(unreadBadge(0), 'нуля на значке быть не должно').toBeNull();
    expect(unreadBadge(undefined)).toBeNull();
  });

  it('в шапке значок, а не ссылка-подпись', () => {
    /*
     * Ищем ПОСТРОЙКУ, а не слово: подстрока `app-shell__bell` нашлась бы внутри соседнего
     * `app-shell__bell-count`, и сторож пропустил бы возврат к ссылке-подписи. На этой же грабле
     * сторожа спотыкались уже четырежды (журналы 494, 537, 542, 552).
     */
    const bar = shell.slice(shell.indexOf('app-shell__userbar'));
    expect(bar, 'колокольчик — ссылка со значком').toMatch(
      /className="app-shell__bell"[\s\S]{0,300}<Icon icon={BellIcon}/
    );
    expect(bar, 'слово «Уведомления» больше не стоит подписью ссылки').not.toMatch(
      />\s*Уведомления\s*</
    );
  });
});
