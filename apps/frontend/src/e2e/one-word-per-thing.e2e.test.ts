import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';

/**
 * Одно понятие — одно слово (`TXT-003` по смыслу).
 *
 * Состояние сущности подписывалось двумя словами сразу: 39 мест говорили «Статус»,
 * 32 — «Состояние». Разнобой завёл я сам в срезах 6–19, а канон задан ТЗ: в макете
 * шаблона реестра (§7.1) колонка и отбор называются **«Статус»**.
 *
 * Проверяется именно ПОДПИСЬ поля состояния — заголовок колонки, подпись фильтра,
 * строка сводки. Составные названия разделов («Состояние обмена», «Состояние очередей»)
 * — это имена блоков, а не подпись поля, и под правило не подпадают.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app'), fromPackages('ui', 'src')];
/*
 * §5.435: общий пакет компонентов смотрится наравне с приложением. Правило кончалось на
 * границе `apps/frontend`, а человек этой границы не видит: подписи состояний, кнопок и
 * предупреждений рисует `@trudskill/ui`, и до ревизии их не проверял никто.
 */

/**
 * Словарь понятий: канонное слово — и слова, которыми его называть нельзя.
 *
 * Ревизия 2026-09-08 (§5.433) обобщила сторожа: он держал ровно одну пару («Статус» против
 * «Состояние»), а рядом жила вторая — одна и та же сущность `crm.counterparties` называлась
 * ТРЕМЯ словами: «Компании» в меню, «Заказчик» в колонке сделок и в фильтрах, «Контрагенты» в
 * хлебных крошках. Человек ищет в журнале «Заказчиков», а в меню находит «Компании».
 *
 * Проверяется ПОДПИСЬ, которую видит человек: заголовок колонки, ярлык фильтра, подпись поля,
 * пункт выпадающего списка. Слово внутри фразы («Заказчик отстранял человека от работы») не
 * подпадает: правило про имя понятия, а не про запрет слова в русском языке.
 */
const TERMS: Array<{ canonical: string; instead: string[]; why: string }> = [
  {
    canonical: 'Статус',
    instead: ['Состояние'],
    why: 'в макете шаблона реестра (ТЗ §7.1) колонка и отбор называются «Статус»'
  },
  {
    canonical: 'Компания',
    instead: ['Заказчик', 'Заказчики', 'Контрагент', 'Контрагенты'],
    why: 'решение владельца IA-017 от 14.08.2026: `/counterparties` перенаправлен на `/admin/clients`, и раздел называется «Компании»'
  }
];

/** Места, где слово — это ПОДПИСЬ понятия, а не часть фразы. */
const labelPatterns = (word: string): RegExp[] => [
  new RegExp(`title: '${word}'`),
  new RegExp(`label: '${word}'`),
  new RegExp(`label = '${word}'`),
  new RegExp(`ui-field-label">${word}<`),
  new RegExp(`<option value="">${word}</option>`)
];

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

describe('одно понятие — одно слово (TXT-003)', () => {
  const files = ROOTS.flatMap((root) => collect(root));

  it('сканер видит достаточно файлов — иначе зелёный ничего не значит', () => {
    expect(files.length).toBeGreaterThan(150);
  });
  /*
   * Прямая проверка, что общий пакет ДЕЙСТВИТЕЛЬНО просматривается (урок §5.426): счётчик
   * файлов приложения перевалит порог и без пакета, поэтому сломанный путь остался бы
   * незамеченным — сторож был бы зелёным на неполном списке.
   */
  it('сканер видит и общий пакет компонентов, а не только приложение', () => {
    const fromPackage = files.filter((file) =>
      file.split('\\').join('/').includes('/packages/ui/src/')
    );
    expect(fromPackage.length, 'файлы `@trudskill/ui` в список не попали').toBeGreaterThan(5);
  });

  it('каждое понятие подписано своим единственным словом', () => {
    const offenders: string[] = [];
    for (const term of TERMS) {
      for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const wrong of term.instead) {
          if (labelPatterns(wrong).some((pattern) => pattern.test(source))) {
            offenders.push(
              `${relative(APP_ROOT, file).replace(/\\/g, '/')} — «${wrong}» вместо ` +
                `«${term.canonical}» (${term.why})`
            );
          }
        }
      }
    }
    expect(offenders, `подписей не тем словом: ${offenders.length}`).toEqual([]);
  });

  it('канонное слово в приложении действительно используется', () => {
    // Защита от «зелено, потому что подписей не осталось вовсе».
    for (const term of TERMS) {
      const used = files.filter((file) =>
        labelPatterns(term.canonical).some((pattern) => pattern.test(readFileSync(file, 'utf8')))
      );
      expect(
        used.length,
        `слово «${term.canonical}» не используется ни в одной подписи`
      ).toBeGreaterThan(0);
    }
  });

  it('у каждого понятия записано, почему канон именно такой', () => {
    // Иначе словарь превращается в список личных предпочтений.
    const vague = TERMS.filter((term) => term.why.trim().length < 25).map((t) => t.canonical);
    expect(vague).toEqual([]);
  });
});
