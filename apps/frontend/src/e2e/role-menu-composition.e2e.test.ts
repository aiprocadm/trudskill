import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS } from './role-permissions.fixture';
import { getNavigationView } from '../features/navigation/helpers';
import { collapseSingleItemGroups, groupItemsByNavGroup } from '../features/navigation/nav-groups';
import { roleBlueprints } from '../features/navigation/role-blueprints';

import type { UserSession } from '../entities/session/model';

/**
 * Состав меню каждой роли (ТЗ «Стабилизация, UX и развитие», 3.2 / Н4).
 *
 * **Как было.** Меню роли собиралось вычитанием из общего, и от блока нередко оставался ОДИН
 * пункт. Живая проверка по снимку прав из базы подтвердила жалобу ТЗ дословно: у методиста блок
 * «Отчёты и выгрузки» состоял из одних «Госвыгрузок», у администратора центра «Люди и группы» —
 * из одной «Массовой загрузки». Всего девять таких блоков у шести ролей из семи. Заголовок
 * группы над единственной строкой — лишний клик и обещание, что внутри есть что-то ещё.
 *
 * **Два критерия приёмки ТЗ, оба здесь:**
 * 1. «Ни у одной роли нет группы с одним пунктом».
 * 2. «Состав меню каждой роли зафиксирован снапшот-тестом» — снимок ниже. Он не украшение:
 *    меню собирается из прав, и правка прав в базе молча меняет состав меню у живых людей.
 *    Снимок делает такую правку видимой на ревью.
 *
 * Права берутся из снимка ЖИВОЙ базы (`role-permissions.fixture.ts`), а не из текста ТЗ —
 * правило `CLAUDE.md`, на котором в репозитории уже обжигались.
 */

const sessionFor = (role: string): UserSession =>
  ({
    user: {
      id: `u_${role}`,
      tenantId: 'tenant_demo',
      login: role,
      email: `${role}@example.com`,
      status: 'active',
      displayName: role
    },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles: [role],
    permissions: [...(ROLE_PERMISSIONS[role] ?? [])]
  }) as unknown as UserSession;

const ROLES = Object.keys(ROLE_PERMISSIONS).sort();

/** Меню роли так, как его увидит человек: короткое меню, одиночные ссылки, группы. */
const menuOf = (role: string) => {
  const view = getNavigationView(sessionFor(role));
  const { loose, groups } = collapseSingleItemGroups(groupItemsByNavGroup(view.more));
  return {
    short: view.main.map((item) => item.label),
    loose: loose.map((item) => item.label),
    groups: groups.map((group) => `${group.label} (${group.items.length})`)
  };
};

describe('состав меню роли (ТЗ 3.2)', () => {
  it('сторож видит все роли живой базы', () => {
    expect(ROLES.length, 'снимок прав пуст — проверка смотрит в пустоту').toBeGreaterThanOrEqual(7);
  });

  it('ни у одной роли нет группы с одним пунктом', () => {
    const offenders: string[] = [];
    for (const role of ROLES) {
      const view = getNavigationView(sessionFor(role));
      const { groups } = collapseSingleItemGroups(groupItemsByNavGroup(view.more));
      for (const group of groups) {
        if (group.items.length === 1) offenders.push(`${role}: «${group.label}»`);
      }
    }
    expect(
      offenders,
      'критерий приёмки ТЗ 3.2: заголовок группы над единственной строкой — лишний клик и ' +
        'обещание, что внутри есть что-то ещё'
    ).toEqual([]);
  });

  it('документ ролей не разошёлся с кодом', () => {
    /*
     * ТЗ 3.2, пункт 1 требует файл `docs/ia/roles.md`. Пересказ кода человеческим языком
     * стареет молча — это класс «дрейф», который в репозитории ловят журналом. Сверяем самое
     * дешёвое и самое ломкое: перечислена ли каждая роль и столько ли у неё задач.
     */
    const doc = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        '..',
        'docs',
        'ia',
        'roles.md'
      ),
      'utf8'
    );

    for (const blueprint of roleBlueprints) {
      expect(doc, `в docs/ia/roles.md нет роли ${blueprint.role}`).toContain(
        `(\`${blueprint.role}\`)`
      );
      for (const job of blueprint.topJobs) {
        expect(doc, `в docs/ia/roles.md нет задачи «${job}» роли ${blueprint.role}`).toContain(job);
      }
    }
  });

  it('у каждой роли описана её работа в 5–8 задачах', () => {
    /* Требование 1 задачи 3.2: меню собирается ПОД задачи роли, значит задачи должны быть. */
    for (const blueprint of roleBlueprints) {
      expect(
        blueprint.topJobs.length,
        `${blueprint.role}: работа роли описана ${blueprint.topJobs.length} задачами вместо 5–8`
      ).toBeGreaterThanOrEqual(5);
      expect(blueprint.topJobs.length).toBeLessThanOrEqual(8);
    }
  });

  it('состав меню каждой роли зафиксирован', () => {
    /*
     * Снимок сверяется на РАВЕНСТВО. Меню собирается из прав: правка прав в базе молча меняет
     * состав меню у живых людей, и заметить это без снимка невозможно. Разошлось — либо
     * изменение осознанное (тогда обновите снимок в этом же PR и объясните в описании), либо
     * права уехали не туда.
     */
    const snapshot = Object.fromEntries(ROLES.map((role) => [role, menuOf(role)]));

    expect(snapshot).toEqual({
      counterparty_rep: {
        short: ['Главная'],
        loose: ['Портал заказчика'],
        groups: []
      },
      learner: {
        short: [
          'Мой кабинет',
          'Мои курсы',
          'Мои тесты',
          'Мои документы',
          'Сообщения',
          'Чат',
          'Главная'
        ],
        loose: ['Календарь'],
        groups: ['Моё обучение (4)']
      },
      manager: {
        short: ['Группы', 'Слушатели', 'Компании', 'Документы', 'Отчеты', 'Главная', 'Курсы'],
        loose: ['Массовая загрузка', 'Портал заказчика'],
        groups: [
          'Обзор (3)',
          'Курсы и контент (4)',
          'Проверка и оценивание (5)',
          'Документы и удостоверения (5)',
          'Отчёты и выгрузки (3)',
          'Коммуникации (2)'
        ]
      },
      methodist: {
        short: [
          'Обучение: сводка',
          'Курсы',
          'Материалы',
          'Задания и тесты',
          'Банки вопросов',
          'Библиотека курсов',
          'Главная'
        ],
        loose: ['Оперативная панель', 'Госвыгрузки'],
        groups: [
          'Курсы и контент (3)',
          'Проверка и оценивание (7)',
          'Документы и удостоверения (7)',
          'Коммуникации (2)'
        ]
      },
      platform_admin: {
        short: [
          'Оперативная панель',
          'Арендаторы платформы',
          'Лицензии',
          'Аудит',
          'Эксплуатация',
          'Настройки',
          'Главная'
        ],
        loose: [],
        groups: [
          'Обзор (2)',
          'Курсы и контент (6)',
          'Проверка и оценивание (9)',
          'Люди и группы (3)',
          'Клиенты и продажи (3)',
          'Документы и удостоверения (8)',
          'Отчёты и выгрузки (5)',
          'Коммуникации (2)',
          'Настройки и система (8)'
        ]
      },
      teacher: {
        short: [
          'Группы',
          'Очередь на проверку',
          'Календарь',
          'Курсы',
          'Сообщения',
          'Главная',
          'Задания и тесты'
        ],
        loose: ['Слушатели', 'Чат'],
        groups: [
          'Обзор (2)',
          'Курсы и контент (3)',
          'Проверка и оценивание (2)',
          'Отчёты и выгрузки (3)'
        ]
      },
      tenant_admin: {
        short: [
          'Оперативная панель',
          'Слушатели',
          'Группы',
          'Задания и тесты',
          'Документы',
          'Отчеты',
          'Настройки'
        ],
        loose: ['Массовая загрузка'],
        groups: [
          'Обзор (3)',
          'Курсы и контент (6)',
          'Проверка и оценивание (8)',
          'Клиенты и продажи (3)',
          'Документы и удостоверения (7)',
          'Отчёты и выгрузки (5)',
          'Коммуникации (2)',
          'Настройки и система (10)'
        ]
      }
    });
  });
});
