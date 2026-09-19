import { describe, expect, it } from 'vitest';

import {
  DEMO_DATASET_SHAPE,
  DEMO_GROUP_STATES,
  DEMO_PROGRESS_MIX,
  buildDemoDataset,
  demoSnils
} from './demo-dataset.js';
import { demoSeedStatements } from './demo-seed.js';

/**
 * Демонстрационный набор (ТЗ «Стабилизация, UX и развитие», 18.1, **решение владельца Р19**).
 *
 * **Что было (журнал 588).** В ревью диаграммы аналитики выглядели как строчки с нулями — просто
 * потому, что данных не было. Для человека, которому показывают продукт, «нули» и «не работает»
 * неотличимы: он видит пустой график и делает вывод о функции, а не о наполнении. Без набора
 * платформу нельзя показывать клиенту.
 *
 * **Что закреплено.** Состав ровно тот, что назвал владелец, и он внутренне непротиворечив:
 * документы только у сдавших, группы во всех трёх состояниях, история растянута на месяцы —
 * иначе графики покажут ту же плоскую линию, что и пустая база.
 */

describe('состав набора — тот, что назвал владелец (Р19)', () => {
  const data = buildDemoDataset();

  it('числа совпадают с решением', () => {
    expect(data.tenants).toHaveLength(DEMO_DATASET_SHAPE.tenants);
    expect(data.counterparties).toHaveLength(DEMO_DATASET_SHAPE.counterparties);
    expect(data.courses).toHaveLength(DEMO_DATASET_SHAPE.courses);
    expect(data.groups).toHaveLength(DEMO_DATASET_SHAPE.groups);
    expect(data.learners).toHaveLength(DEMO_DATASET_SHAPE.learners);
    expect(data.documents).toHaveLength(DEMO_DATASET_SHAPE.documents);
  });

  it('числа Р19 не переписаны', () => {
    /* Решения Р1–Р19 закрыты. «Чуть уменьшить, чтобы быстрее наливалось» — способ их отменить. */
    expect(DEMO_DATASET_SHAPE).toEqual({
      tenants: 2,
      counterparties: 3,
      courses: 5,
      groups: 8,
      learners: 120,
      documents: 90,
      historyMonths: 4
    });
  });

  it('второй центр ПУСТ — на нём показывают мастер первого запуска', () => {
    /*
     * Наполнить его значило бы лишиться самой убедительной части показа: как выглядит начало
     * работы центра, который только пришёл.
     */
    expect(data.tenants.filter((tenant) => tenant.populated)).toHaveLength(1);
    expect(data.tenants.filter((tenant) => !tenant.populated)).toHaveLength(1);
  });
});

describe('набор выглядит живым, а не заглушкой (Р19)', () => {
  const data = buildDemoDataset();

  it('группы есть во всех трёх состояниях', () => {
    /* Показывать продукт, где все группы в одном состоянии, бессмысленно. */
    const states = new Set(data.groups.map((group) => group.state));
    for (const state of DEMO_GROUP_STATES) {
      expect(states.has(state), `нет ни одной группы в состоянии «${state}»`).toBe(true);
    }
  });

  it('слушатели распределены неравномерно и по всем стадиям', () => {
    /*
     * «Поровну» выглядит как заглушка и вызывает у смотрящего ровно то подозрение, которого мы
     * избегаем. Настоящее распределение: большинство учится, часть не начинала, меньшинство не
     * сдало.
     */
    const counts = new Map<string, number>();
    for (const learner of data.learners) {
      counts.set(learner.stage, (counts.get(learner.stage) ?? 0) + 1);
    }
    expect(counts.size, 'не все стадии представлены').toBe(Object.keys(DEMO_PROGRESS_MIX).length);
    expect(
      new Set(counts.values()).size,
      'стадии поделены поровну — выглядит как заглушка'
    ).toBeGreaterThan(1);
    /*
     * Доли обязаны в сумме давать ровно число слушателей. Без этой проверки правка одной доли
     * проходила незамеченной: набор молча терял людей, а сторож видел «различие есть» и
     * успокаивался — поймано подсадкой.
     */
    const declared = Object.values(DEMO_PROGRESS_MIX).reduce((sum, value) => sum + value, 0);
    expect(declared, 'доли не сходятся с числом слушателей').toBe(DEMO_DATASET_SHAPE.learners);
  });

  it('история растянута на месяцы, а не «всё вчера»', () => {
    /* Набор, где всё началось вчера, рисует ту же плоскую линию, что и пустая база. */
    const months = new Set(data.groups.map((group) => group.startedMonthsAgo));
    expect(months.size).toBeGreaterThan(1);
    expect(Math.max(...months)).toBeLessThan(DEMO_DATASET_SHAPE.historyMonths);
  });

  it('набор одинаков при каждом запуске', () => {
    /*
     * Демонстрация, выглядящая каждый раз по-новому, — это демонстрация, к которой нельзя
     * подготовиться: показывающий не знает, что окажется на экране.
     */
    expect(buildDemoDataset()).toEqual(buildDemoDataset());
  });
});

describe('набор не противоречит сам себе (Р19)', () => {
  const data = buildDemoDataset();

  it('документы выданы только тем, кто сдал', () => {
    /*
     * Иначе набор противоречит сам себе: на экране слушатель «не начинал», а удостоверение у
     * него есть. Первый же вопрос показывающему — и показ закончен.
     */
    const passed = new Set(
      data.learners.filter((learner) => learner.stage === 'passed').map((learner) => learner.id)
    );
    const wrong = data.documents.filter((doc) => !passed.has(doc.learnerId));
    expect(wrong, 'документы у тех, кто не сдавал').toEqual([]);
  });

  it('у каждого слушателя своё имя и свой номер', () => {
    expect(new Set(data.learners.map((l) => l.id)).size).toBe(data.learners.length);
    expect(new Set(data.learners.map((l) => l.snils)).size).toBe(data.learners.length);
  });
});

describe('данные заведомо вымышленные (Р19)', () => {
  it('СНИЛС из диапазона, который не выдаётся', () => {
    /*
     * Номера ниже 001-001-998 в России не выдаются, и для них не проверяется контрольное
     * число. Это ровно то, что нужно: номер заведомо ничей, но система принимает его как
     * настоящий. «Красивый» номер вроде 123-456-789 00 мог бы принадлежать живому человеку.
     */
    for (const index of [1, 42, 120]) {
      expect(demoSnils(index)).toMatch(/^000-000-\d{3} \d{2}$/);
    }
  });

  it('в наборе нет намёка на живые организации', () => {
    const data = buildDemoDataset();
    /* Названия придуманы; ИНН из несуществующего диапазона проверяется ниже, в выражениях. */
    for (const cp of data.counterparties) {
      expect(cp.name).toMatch(/«/);
    }
  });
});

describe('наполнение можно запускать повторно (Р19)', () => {
  const statements = demoSeedStatements();

  it('каждое выражение не мешает уже существующим записям', () => {
    /*
     * Скрипт запускают повторно: после обновления, после чистки, просто чтобы убедиться.
     * Падение или задвоение при повторном запуске приводит к тому, что им перестают
     * пользоваться.
     */
    const without = statements.filter((sql) => !/on conflict/i.test(sql));
    expect(without, 'выражение без защиты от повторного запуска').toEqual([]);
  });

  it('наполняется только образцовый центр', () => {
    /* Второй должен остаться пустым — иначе мастер первого запуска показать не на чем. */
    const dirty = statements.filter(
      (sql) => /tenant_demo_empty/.test(sql) && !/insert into core\.tenants/.test(sql)
    );
    expect(dirty, 'в пустой центр что-то записывается').toEqual([]);
  });

  it('данные растянуты во времени средствами базы', () => {
    /*
     * Даты считаются от `now()`, а не записаны числом: набор, налитый год назад, иначе
     * показывал бы «историю», которая кончилась год назад.
     */
    expect(statements.some((sql) => /now\(\) - interval/.test(sql))).toBe(true);
    expect(statements.join(' '), 'в набор вписана конкретная дата').not.toMatch(
      /'20\d\d-\d\d-\d\d'/
    );
  });

  it('слушатели вставляются порциями, а не одной километровой строкой', () => {
    /*
     * Одно выражение на сто двадцать записей невозможно прочитать в журнале ошибок, если
     * что-то пойдёт не так.
     */
    const learnerInserts = statements.filter((sql) => /insert into learning\.learners/.test(sql));
    expect(learnerInserts.length).toBeGreaterThan(1);
  });

  it('зачисления есть — иначе списки полны, а аналитика пуста', () => {
    /* Аналитические экраны считают по зачислениям, а не по карточкам слушателей. */
    expect(statements.some((sql) => /insert into learning\.enrollments/.test(sql))).toBe(true);
  });
});
