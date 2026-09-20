import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SEARCH_ENTITY_LABELS, type SearchSource, search } from './global-search.js';
import {
  SEARCH_EMPTY_HINT,
  allowedEntities,
  entitiesHintedBy,
  searchEmptyResult,
  searchScope
} from './search-synonyms.js';

/**
 * Поиск ищет данные, а не названия разделов (ТЗ «Стабилизация, UX и развитие», 3.6 / Н6).
 *
 * **Что было (журнал 590).** `Ctrl+K` искал только по пунктам меню. Человек вводил «серт» и
 * получал «Ничего не найдено» — хотя в системе есть и «Удостоверения», и «Документы». А
 * администратору платформы при этом предлагались пункты слушателя: «Мой кабинет», «Мои курсы».
 *
 * **Главное в этом поиске — не находить лишнего.** Строка поиска есть у всех, и она соблазняет
 * ввести фамилию знакомого. Поэтому область считается по ПРАВАМ, на сервере, до всякого
 * обращения к данным; а найденный СНИЛС показывается частично — иначе поиск становится обходным
 * путём к персональным данным.
 */

const here = dirname(fileURLToPath(import.meta.url));
const controller = readFileSync(resolve(here, '..', 'mvp.controller.ts'), 'utf8');

const ALL = [
  'learners.read',
  'groups.read',
  'courses.read',
  'counterparties.read',
  'documents.read'
];

const source: SearchSource = {
  learners: [
    { id: 'l1', lastName: 'Иванов', firstName: 'Пётр', snils: '123-456-789 00' },
    { id: 'l2', lastName: 'Петров', firstName: 'Иван' }
  ],
  groups: [{ id: 'g1', name: 'Охрана труда, поток 3', courseTitle: 'Охрана труда' }],
  courses: [{ id: 'c1', title: 'Охрана труда для руководителей' }],
  counterparties: [{ id: 'cp1', name: 'ООО «Строймонтаж»' }],
  documents: [{ id: 'd1', number: 'УД-2026-0042', learnerName: 'Иванов Пётр' }]
};

describe('поиск находит данные, а не разделы (ТЗ 3.6)', () => {
  it('по фамилии находит слушателя', () => {
    const hits = search('Иванов', ALL, source);
    expect(hits.some((hit) => hit.entity === 'learner' && hit.id === 'l1')).toBe(true);
  });

  it('по номеру находит документ', () => {
    /* Номер вводят и с разделителями, и без — человек списывает его с бумаги. */
    expect(search('0042', ALL, source).some((hit) => hit.entity === 'document')).toBe(true);
    expect(search('УД-2026', ALL, source).some((hit) => hit.entity === 'document')).toBe(true);
  });

  it('по названию находит группу и курс', () => {
    const hits = search('охрана', ALL, source);
    expect(hits.some((hit) => hit.entity === 'group')).toBe(true);
    expect(hits.some((hit) => hit.entity === 'course')).toBe(true);
  });

  it('каждая находка ведёт на карточку объекта', () => {
    /* Критерий приёмки ТЗ: найти и ОТКРЫТЬ. Строка, никуда не ведущая, задачу не решает. */
    for (const hit of search('Иванов', ALL, source)) {
      expect(hit.href, `${hit.entity} никуда не ведёт`).toMatch(/^\/[a-z-]+\/[\w-]+$/);
    }
  });

  it('один символ ничего не ищет', () => {
    /*
     * Он совпадёт почти со всем и выдаст случайную выборку, которая выглядит как ответ — а это
     * хуже пустоты: человек решает, что нашёл не то, и уходит.
     */
    expect(search('и', ALL, source)).toEqual([]);
  });
});

describe('синонимы (ТЗ 3.6, пункт 2)', () => {
  it('«серт» и «корочка» ведут к документам', () => {
    expect(entitiesHintedBy('серт')).toContain('document');
    expect(entitiesHintedBy('корочка')).toContain('document');
    expect(entitiesHintedBy('удостоверение')).toContain('document');
  });

  it('слова центра — «ученик», «курсант» — ведут к слушателям', () => {
    expect(entitiesHintedBy('ученик')).toContain('learner');
    expect(entitiesHintedBy('курсант')).toContain('learner');
  });

  it('обычное слово намёка не даёт — ищем везде', () => {
    /*
     * Пустой намёк означает «искать везде», а не «нигде»: человек чаще вводит фамилию, чем
     * слово «слушатель», и поиск, который без намёка молчит, бесполезен в самом частом случае.
     */
    expect(entitiesHintedBy('Иванов')).toEqual([]);
    expect(searchScope('Иванов', ALL).length).toBe(ALL.length);
  });
});

describe('права решают, что можно найти (ТЗ 3.6, пункт 3)', () => {
  it('без права тип не ищется', () => {
    const hits = search('Иванов', ['groups.read'], source);
    expect(
      hits.some((hit) => hit.entity === 'learner'),
      'слушатель найден без права'
    ).toBe(false);
  });

  it('намёк СУЖАЕТ область, но не расширяет', () => {
    /*
     * Обратный порядок был бы дырой в правах, открываемой одним словом в строке поиска: попросив
     * «сертификат», человек получал бы документы, которых ему видеть не положено.
     */
    expect(searchScope('сертификат', ['learners.read'])).not.toContain('document');
  });

  it('человек без единого права не находит ничего', () => {
    expect(allowedEntities([])).toEqual([]);
    expect(search('Иванов', [], source)).toEqual([]);
  });

  it('намёк на недоступное не обнуляет поиск', () => {
    /*
     * Иначе поиск молча возвращает пустоту, и человек решает, что данных нет, — хотя их просто
     * не его правами искать.
     */
    expect(searchScope('сертификат', ['learners.read'])).toContain('learner');
  });
});

describe('поиск не становится обходным путём к персональным данным (ТЗ 3.6 + 17.2)', () => {
  it('СНИЛС в подсказке показан частично', () => {
    /* Строка поиска есть у всех — полный номер в ней свёл бы на нет маскирование в списках. */
    const hit = search('Иванов', ALL, source).find((item) => item.entity === 'learner');
    expect(hit?.subtitle).toBe('***-***-*** 00');
  });

  it('по паре цифр СНИЛС не ищется', () => {
    /*
     * Короткий набор цифр совпал бы с половиной базы и превратил поиск в перебор чужих номеров.
     */
    const hits = search('00', ALL, source);
    expect(hits.some((hit) => hit.entity === 'learner')).toBe(false);
  });

  it('выдача на тип ограничена', () => {
    /*
     * Список из сорока строк одного типа не помогает: человек ищет конкретное и должен увидеть
     * его сразу или уточнить запрос.
     */
    const many: SearchSource = {
      ...source,
      learners: Array.from({ length: 40 }, (_, i) => ({
        id: `l${i}`,
        lastName: 'Иванов',
        firstName: `Имя${i}`
      }))
    };
    expect(search('Иванов', ALL, many).filter((hit) => hit.entity === 'learner')).toHaveLength(5);
  });
});

describe('человеку сказано, что искать и что делать (ТЗ 3.6, пункт 4)', () => {
  it('пустая строка объясняет, что можно искать', () => {
    expect(SEARCH_EMPTY_HINT).toMatch(/фамилию/i);
    expect(SEARCH_EMPTY_HINT).toMatch(/номер документа/i);
  });

  it('пустой результат называет запрос и подсказывает', () => {
    /* Без названного запроса человек не понимает, искали ли то, что он набрал. */
    const text = searchEmptyResult('Иваноов');
    expect(text).toContain('Иваноов');
    expect(text).toMatch(/часть слова/i);
  });

  it('у каждого типа русское название', () => {
    for (const label of Object.values(SEARCH_ENTITY_LABELS)) {
      expect(label).toMatch(/^[А-ЯЁ]/);
    }
  });
});

describe('поиск подключён к ручке (ТЗ 3.6)', () => {
  it('ручка есть и зовёт службу с правами человека', () => {
    /* «Построено и не подключено» — самая частая находка в этом коде. */
    expect(controller).toMatch(/@Get\('search'\)/);
    expect(controller).toMatch(/globalSearch\(c\.tenantId!, q, c\.permissions\)/);
  });

  it('частота ограничена — поиск зовут на каждое нажатие клавиши', () => {
    const endpoint = controller.slice(controller.indexOf("@Get('search')"));
    expect(endpoint.slice(0, 300)).toMatch(/@Throttle/);
  });
});
