import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';

/**
 * `TXT-007`: обращение на «вы» со строчной буквы, без восклицательных знаков, без «пожалуйста».
 *
 * Правило кажется мелочью, но задаёт тон всего продукта. «Вы» с большой буквы — письмо
 * начальнику, а не рабочий инструмент; восклицательный знак либо кричит, либо фальшиво
 * радуется («Все курсы завершены — отлично!»); «пожалуйста» в интерфейсе означает, что
 * система просит человека сделать её работу.
 *
 * Сейчас код правилу соответствует — сторож нужен, чтобы соответствовал и завтра: тон
 * размывается по одной строке за раз, и заметить это на ревью почти невозможно.
 */

const ROOTS = [fromApp('src'), fromApp('app'), fromPackages('ui', 'src')];
/*
 * §5.435: общий пакет компонентов смотрится наравне с приложением. Правило кончалось на
 * границе `apps/frontend`, а человек этой границы не видит: подписи состояний, кнопок и
 * предупреждений рисует `@trudskill/ui`, и до ревизии их не проверял никто.
 */

/**
 * «Вы» и его формы с большой буквы ВНУТРИ предложения — это вежливая форма, которую ТЗ
 * запрещает. В начале предложения та же большая буква — обычная орфография, и трогать её
 * нельзя: «Ваши сотрудники и группы» в начале фразы написано верно.
 *
 * Поэтому слово ловится только тогда, когда перед ним уже был текст и не было точки.
 *
 * Формы перечислены ПОЛНОСТЬЮ, по падежам: первая редакция сторожа знала семь форм из
 * семнадцати и на мутации «в Вашем разделе» промолчала. Неполный список — это сторож,
 * который зелёный по недосмотру, а не по факту.
 */
const CAPITAL_YOU =
  /[А-Яа-яЁё0-9,;:)»"'—-]\s+(Вы|Вам|Вас|Вами|Ваш|Ваша|Ваше|Ваши|Ваших|Вашего|Вашему|Вашем|Вашей|Вашею|Вашу|Вашим|Вашими)([^А-Яа-яЁё]|$)/;

const PLEASE = /пожалуйста/i;

/**
 * Восклицательный знак в тексте для человека. `!==`, `!=`, `!value` — это код, а не речь,
 * поэтому ищем знак только после русской буквы: так отсекается всё программное.
 */
const SHOUTING = /[А-Яа-яЁё][^'"`\n]{0,80}!/;

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if ((full.endsWith('.tsx') || full.endsWith('.ts')) && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Только строковые литералы: комментарии и код — не речь продукта. */
const literals = (source: string): string[] => {
  const found: string[] = [];
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const match of withoutComments.matchAll(/'([^'\n]{2,200})'|"([^"\n]{2,200})"/g)) {
    const value = match[1] ?? match[2] ?? '';
    if (/[А-Яа-яЁё]/.test(value)) found.push(value);
  }
  return found;
};

const scan = (rule: RegExp): string[] => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of collect(root)) {
      for (const text of literals(readFileSync(file, 'utf8'))) {
        if (rule.test(text)) offenders.push(`${relative(APP_ROOT, file)}: «${text}»`);
      }
    }
  }
  return offenders;
};

describe('TXT-007 · тон обращения', () => {
  it('сторож видит тексты (не пустой список)', () => {
    const texts = ROOTS.flatMap((root) =>
      collect(root).flatMap((file) => literals(readFileSync(file, 'utf8')))
    );
    expect(texts.length).toBeGreaterThan(500);
  });
  /*
   * Прямая проверка, что общий пакет ДЕЙСТВИТЕЛЬНО просматривается (урок §5.426): счётчик
   * файлов приложения перевалит порог и без пакета, поэтому сломанный путь остался бы
   * незамеченным — сторож был бы зелёным на неполном списке.
   */
  it('сканер видит и общий пакет компонентов, а не только приложение', () => {
    const fromPackage = ROOTS.flatMap((root) => collect(root)).filter((file) =>
      file.split('\\').join('/').includes('/packages/ui/src/')
    );
    expect(fromPackage.length, 'файлы `@trudskill/ui` в список не попали').toBeGreaterThan(5);
  });

  it('«вы» пишется со строчной буквы', () => {
    const offenders = scan(CAPITAL_YOU);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('интерфейс не кричит: восклицательных знаков нет', () => {
    const offenders = scan(SHOUTING);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('система не говорит «пожалуйста» — она делает свою работу', () => {
    const offenders = scan(PLEASE);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
