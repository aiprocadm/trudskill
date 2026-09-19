import { readFileSync } from 'node:fs';

import { PERFORMANCE_BUDGETS } from '@trudskill/shared-types';
import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Бюджеты производительности (ТЗ «Стабилизация, UX и развитие», 15.3, **решение владельца Р16**).
 *
 * **Что было (журнал 585).** Бюджеты жили только в тексте ТЗ, то есть не проверял их никто.
 * И один из них уже разошёлся с кодом: размер страницы списка по умолчанию был **20**, а Р16
 * называет **50**. Двадцать строк означают постоянное пролистывание там, где у центра сотни
 * слушателей, — и заметить это по коду было нельзя, потому что сравнивать было не с чем.
 *
 * **Что закреплено.** Числа Р16 записаны значениями в одном месте, и код обязан им
 * соответствовать. Бюджет, который живёт в тексте документа, превращается в пожелание и тихо
 * перестаёт выполняться.
 *
 * **Чего этот сторож НЕ проверяет и почему.** Появление содержимого (LCP) и время ответа
 * ручек — измеряются под нагрузкой и в браузере; ни того, ни другого в наборе тестов нет
 * (`RISK-002` запрещает новые внешние зависимости, а CI проекта не запускается с мая). Их
 * бюджеты здесь всё равно записаны числами: когда появится способ мерить, сравнивать будет с
 * чем, а до тех пор они хотя бы не разойдутся по документам.
 */

const service = stripComments(
  readFileSync(fromApp('..', 'backend', 'src', 'modules', 'mvp', 'mvp.service.ts'), 'utf8')
);

describe('числа решения Р16 записаны и осмысленны (ТЗ 15.3)', () => {
  it('все бюджеты объявлены', () => {
    for (const key of [
      'initialJsKb',
      'lcpSeconds',
      'apiP95Ms',
      'listPageSize',
      'listPageSizeMax',
      'examAnswerSaveP95Ms',
      'virtualizeRowsFrom'
    ] as const) {
      expect(PERFORMANCE_BUDGETS[key], `бюджет ${key} исчез`).toBeGreaterThan(0);
    }
  });

  it('числа те, что назвал владелец', () => {
    /*
     * Сверяется дословно: решения Р1–Р19 закрыты и не переоткрываются. «Немного поправить
     * бюджет, чтобы сборка проходила» — самый простой способ его отменить.
     */
    expect(PERFORMANCE_BUDGETS.initialJsKb).toBe(300);
    expect(PERFORMANCE_BUDGETS.lcpSeconds).toBe(2.5);
    expect(PERFORMANCE_BUDGETS.apiP95Ms).toBe(500);
    expect(PERFORMANCE_BUDGETS.listPageSize).toBe(50);
    expect(PERFORMANCE_BUDGETS.examAnswerSaveP95Ms).toBe(300);
  });

  it('сохранение ответа на экзамене строже обычной ручки', () => {
    /*
     * Не вкус: человек на экзамене нажимает следующий вопрос сразу, и надпись «Сохранено»,
     * догоняющая его через полсекунды, начинает раздражать и отвлекать от вопросов.
     */
    expect(PERFORMANCE_BUDGETS.examAnswerSaveP95Ms).toBeLessThan(PERFORMANCE_BUDGETS.apiP95Ms);
  });

  it('потолок страницы больше умолчания, но не безграничен', () => {
    /*
     * Без потолка один запрос отдавал всю таблицу слушателей со СНИЛС — это и нагрузка, и
     * утечка разом.
     */
    expect(PERFORMANCE_BUDGETS.listPageSizeMax).toBeGreaterThan(PERFORMANCE_BUDGETS.listPageSize);
    expect(PERFORMANCE_BUDGETS.listPageSizeMax).toBeLessThanOrEqual(500);
  });
});

describe('код соответствует бюджету, а не сам себе (ТЗ 15.3)', () => {
  it('сервер отдаёт страницу того размера, что назвал владелец', () => {
    /*
     * Число объявлено в бэкенде отдельно — тащить туда новую зависимость ради одной константы
     * дороже, чем сверить два числа тестом. Но расхождение не должно проходить молча: тот же
     * приём, что у копии разбора тикета подключения.
     */
    const declared = /const LIST_PAGE_SIZE = (\d+);/.exec(service)?.[1];
    expect(declared, 'в сервере больше нет объявления размера страницы').toBeTruthy();
    expect(Number(declared), 'размер страницы в сервере разошёлся с бюджетом Р16').toBe(
      PERFORMANCE_BUDGETS.listPageSize
    );
  });

  it('потолок страницы в сервере совпадает с бюджетом', () => {
    const declared = /const LIST_PAGE_SIZE_MAX = (\d+);/.exec(service)?.[1];
    expect(Number(declared)).toBe(PERFORMANCE_BUDGETS.listPageSizeMax);
  });

  it('умолчание применяется и к пустому, и к мусорному размеру', () => {
    /*
     * Постройка важнее слова: «?page_size=abc» не должно означать «отдай всё». Проверяем, что
     * и в запасном пути стоит то же число, а не ноль и не бесконечность.
     */
    const body = service.slice(service.indexOf('const sizeFromWire'));
    const uses = body.slice(0, 700).match(/LIST_PAGE_SIZE\b/g) ?? [];
    expect(uses.length, 'умолчание применяется не во всех путях').toBeGreaterThanOrEqual(2);
  });

  it('потолок применяется только к тому, что пришло с проволоки', () => {
    /*
     * Внутренние вызовы передают число и потолка не имеют: госвыгрузки собирают зачисления
     * страницами по тысяче, и молчаливая обрезка до двухсот была бы дефектом хуже исходного.
     */
    expect(service).toMatch(/sizeFromWire[\s\S]{0,200}Math\.min\(LIST_PAGE_SIZE_MAX/);
  });
});
