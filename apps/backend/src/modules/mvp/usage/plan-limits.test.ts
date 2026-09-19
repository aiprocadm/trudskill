import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LIMIT_DEFAULTS,
  canAddNew,
  limitThresholds,
  usageNotice,
  usageState
} from './plan-limits.js';

/**
 * Тариф, лимиты и потребление (ТЗ «Стабилизация, UX и развитие», 13.2, решения Р12 и Р13).
 *
 * Здесь закреплены два решения владельца целиком, потому что оба стоят денег:
 *
 * - **Р12** — за что платит центр: активный слушатель это уникальный человек, который в
 *   расчётном месяце НАЧАЛ обучение или ПОЛУЧИЛ документ. Не «за место в системе».
 * - **Р13** — мягкая блокировка: при превышении прекращается ТОЛЬКО добавление новых слушателей
 *   и запуск новых групп. Никогда не прекращаются: доступ уже обучающихся, выдача документов по
 *   завершённому обучению, выгрузки в реестр.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

describe('пороги предупреждений — настройка, а не число в коде (Р13)', () => {
  it('без настройки действует умолчание 80 %', () => {
    expect(limitThresholds(undefined)).toEqual(LIMIT_DEFAULTS);
    expect(limitThresholds({})).toEqual({ warnAtPercent: 80 });
  });

  it('настройка платформы применяется', () => {
    expect(limitThresholds({ planLimitThresholds: { warnAtPercent: 90 } })).toEqual({
      warnAtPercent: 90
    });
  });

  it('непригодная настройка откатывается к умолчанию', () => {
    /* Ниже 1 % предупреждение стало бы вечным, выше 99 % — бесполезным. */
    for (const broken of [0, 100, -5, 'девяносто', null]) {
      expect(limitThresholds({ planLimitThresholds: { warnAtPercent: broken } })).toEqual(
        LIMIT_DEFAULTS
      );
    }
  });
});

describe('состояние потребления (Р13)', () => {
  it('безлимит — всегда «в порядке»', () => {
    expect(usageState(1000, null)).toBe('ok');
    expect(usageState(1000, 0), 'нулевой лимит — это не «ноль мест», а «лимита нет»').toBe('ok');
  });

  it('предупреждение приходит на пороге, а не после него', () => {
    expect(usageState(79, 100)).toBe('ok');
    expect(usageState(80, 100), 'ровно 80 % — уже предупреждение').toBe('warning');
    expect(usageState(99, 100)).toBe('warning');
  });

  it('«место кончилось» и «уже не хватает» — разные состояния', () => {
    /* Человеку это разные новости, и вторая требует другого тона. */
    expect(usageState(100, 100)).toBe('reached');
    expect(usageState(101, 100)).toBe('exceeded');
  });

  it('настроенный порог действительно меняет поведение', () => {
    expect(usageState(85, 100, { warnAtPercent: 90 })).toBe('ok');
    expect(usageState(90, 100, { warnAtPercent: 90 })).toBe('warning');
  });
});

describe('что запрещено и что продолжается (Р13)', () => {
  it('заводить новое нельзя только при исчерпанном лимите', () => {
    expect(canAddNew('ok')).toBe(true);
    expect(canAddNew('warning'), 'предупреждение не запрещает работать').toBe(true);
    expect(canAddNew('reached')).toBe(false);
    expect(canAddNew('exceeded')).toBe(false);
  });

  it('каждое сообщение называет, что ПРОДОЛЖАЕТСЯ', () => {
    /*
     * Главное в решении Р13 — вторая половина фразы. Владелец объяснил дословно:
     * «заблокировать выдачу удостоверения человеку, который уже отучился, — значит подставить
     * центр перед его клиентом и гарантированно потерять арендатора». Если об этом не написать,
     * центр при первом предупреждении решит, что у него сейчас встанет всё.
     */
    for (const state of ['warning', 'reached', 'exceeded'] as const) {
      const notice = usageNotice(state, 100, 100);
      expect(notice.text, `${state}: не сказано про обучение идущих групп`).toContain(
        'Обучение идущих групп'
      );
      expect(notice.text, `${state}: не сказано про выдачу документов`).toContain(
        'выдача документов'
      );
      expect(notice.text, `${state}: не сказано про выгрузки`).toContain('выгрузки в реестр');
    }
  });

  it('в порядке — молчим', () => {
    expect(usageNotice('ok', 10, 100)).toEqual({ tone: 'none', text: '' });
    expect(usageNotice('ok', 10, null), 'без лимита говорить не о чем').toEqual({
      tone: 'none',
      text: ''
    });
  });

  it('тон растёт вместе с серьёзностью', () => {
    expect(usageNotice('warning', 80, 100).tone).toBe('warning');
    expect(usageNotice('reached', 100, 100).tone).toBe('danger');
    expect(usageNotice('exceeded', 120, 100).tone).toBe('danger');
  });
});

describe('расчёт активных слушателей следует Р12 (13.2)', () => {
  const source = readFileSync(resolve(HERE, 'tenant-usage.service.ts'), 'utf8');

  it('считаются начавшие обучение В РАСЧЁТНОМ МЕСЯЦЕ, а не все учащиеся', () => {
    /*
     * Прежний запрос считал всех с незакрытым зачислением независимо от даты начала: человек,
     * записанный в январе и учащийся полгода, попадал в счёт КАЖДЫЙ месяц. Это ровно модель
     * «оплата за место в системе», которую Р12 отвергает со словами «штрафует за архив»
     * (журнал 553).
     */
    expect(source, 'начало обучения обязано ограничиваться расчётным месяцем').toMatch(
      /e\.enrolled_at >= date_trunc\('month', now\(\)\)/
    );
    expect(source, 'прежнего счёта «все незакрытые» быть не должно').not.toMatch(
      /e\.status in \('pending', 'active'\)/
    );
  });

  it('считаются завершившие обучение в расчётном месяце — это и есть «получил документ»', () => {
    /*
     * Первый заход брал документы из `documents.generated_documents`, и сторож мёртвых таблиц
     * показал, что она НЕ ПИШЕТСЯ: документы лежат снимками. Запрос всегда возвращал бы ноль —
     * дефект тише и хуже прежнего. Документ выпускается по завершении обучения, поэтому
     * завершение выражает ту же половину Р12 через данные, которые в базе есть (журнал 553).
     */
    expect(source).toMatch(/e\.status = 'completed'/);
    expect(source).toMatch(/e\.completed_at >= date_trunc\('month', now\(\)\)/);
    expect(source, 'завершение тоже ограничено расчётным месяцем').toMatch(
      /e\.completed_at < date_trunc\('month', now\(\)\) \+ interval '1 month'/
    );
  });

  it('отменённое зачисление не считается', () => {
    /* Человек обучение не начинал. */
    expect(source).toMatch(/e\.status <> 'cancelled'/);
  });

  it('человек считается один раз, даже если и начал, и получил документ', () => {
    expect(source, 'иначе центр заплатит за одного человека дважды').toMatch(
      /count\(distinct learner_id\)/
    );
    expect(source, 'две выборки объединяются без повторов').toMatch(/\bunion\b/);
  });
});
