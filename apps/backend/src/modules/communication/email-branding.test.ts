import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { brandedLetter, escapeHtml, readableOn } from './email-branding.js';

/**
 * Фирменное оформление письма (ТЗ 11.2 пункт 2, парная задача к 13.3 / Р14; журналы 597, 598).
 *
 * **Что здесь проверяется.** Не «письмо красивое», а три вещи, каждая из которых незаметна на
 * экране разработчика и заметна у получателя: письмо читается БЕЗ картинок, надпись на
 * фирменном фоне читаема при любом цвете центра, и подставленные значения не ломают вёрстку.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const letter = (over: Parameters<typeof brandedLetter>[0] | Record<string, unknown> = {}) =>
  brandedLetter({
    subject: 'Повторная проверка знаний',
    body: 'Здравствуйте, Пётр!\n\nПройти проверку нужно до 1 октября.\n\nС уважением.',
    branding: { displayName: 'Учебный центр «Альфа»', brandColor: '#3b4fe4' },
    ...(over as object)
  } as Parameters<typeof brandedLetter>[0]);

describe('письмо читается без картинок (ТЗ 11.2, пункт 2)', () => {
  it('название центра стоит ТЕКСТОМ, а не только в логотипе', () => {
    /*
     * Почтовые программы блокируют картинки по умолчанию: у большинства получателей логотип
     * просто не загрузится. Если название живёт только внутри картинки, человек получает
     * письмо неизвестно от кого.
     */
    const html = letter({
      branding: {
        displayName: 'Учебный центр «Альфа»',
        logoUrl: 'https://cdn.example.ru/logo.png',
        brandColor: '#3b4fe4'
      }
    });
    /*
     * Ищем название именно В ШАПКЕ — до основного текста. Проверка «название есть где-нибудь
     * в письме» слабее, чем кажется: оно есть ещё и в подвале («отправлено от имени…»), и
     * подсаженная поломка «название только внутри картинки» её проходила.
     */
    const header = html.slice(0, html.indexOf('<h1'));
    const headerWithoutImages = header.replace(/<img[^>]*>/g, '');
    expect(headerWithoutImages).toContain('Учебный центр «Альфа»');
  });

  it('у логотипа есть подпись для тех, кто читает письмо голосом', () => {
    const html = letter({
      branding: { displayName: 'Альфа', logoUrl: 'https://cdn.example.ru/logo.png' }
    });
    expect(html).toMatch(/<img[^>]*alt="[^"]+"/);
  });

  it('без логотипа письмо собирается и не оставляет пустой картинки', () => {
    expect(letter()).not.toContain('<img');
  });
});

describe('надпись на фирменном фоне читаема при любом цвете', () => {
  it('на тёмном фоне — светлый текст, на светлом — тёмный', () => {
    /*
     * Та же ловушка, что была с кнопками в 13.3: цвет центра может оказаться жёлтым, а белый
     * текст на жёлтом нечитаем. Поэтому цвет надписи считается от фона, а не прибивается.
     */
    expect(readableOn('#0f172a')).toBe('#ffffff');
    expect(readableOn('#facc15')).toBe('#0f172a');
    expect(readableOn('#ffffff')).toBe('#0f172a');
  });

  it('испорченный цвет не роняет письмо', () => {
    expect(readableOn('зелёненький')).toBe('#ffffff');
    expect(() => letter({ branding: { displayName: 'Альфа', brandColor: 'нет' } })).not.toThrow();
  });

  it('фирменный цвет центра действительно попадает в письмо', () => {
    /* Иначе оформление «есть», но одинаковое у всех — ради этого задача и делалась. */
    expect(letter({ branding: { displayName: 'Альфа', brandColor: '#a21caf' } })).toContain(
      '#a21caf'
    );
  });
});

describe('подставленные значения не ломают вёрстку', () => {
  it('угловые скобки в названии центра экранируются', () => {
    /* «ООО <Альфа>» иначе превратилось бы в разметку и съело часть письма. */
    const html = letter({ branding: { displayName: 'ООО <Альфа> & Ко' } });
    expect(html).toContain('ООО &lt;Альфа&gt; &amp; Ко');
    expect(html).not.toContain('<Альфа>');
  });

  it('разметка в тексте письма тоже экранируется', () => {
    const html = letter({ body: 'Здравствуйте, <b>Пётр</b>!' });
    expect(html).toContain('&lt;b&gt;');
  });

  it('адрес логотипа экранируется', () => {
    const html = letter({
      branding: { displayName: 'Альфа', logoUrl: 'https://x.ru/a.png?a="b' }
    });
    expect(html).not.toMatch(/src="https:\/\/x\.ru\/a\.png\?a="b"/);
  });

  it('escapeHtml закрывает все пять опасных знаков', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('письмо остаётся письмом, а не веб-страницей', () => {
  it('оформление написано прямо в тегах', () => {
    /*
     * Почтовые программы вырезают отдельные таблицы стилей. Оформление, вынесенное в
     * `<style>`, до получателя не доедет — письмо придёт голым.
     */
    expect(letter()).not.toContain('<style');
    expect(letter()).toMatch(/style="/);
  });

  it('каркас собран таблицами', () => {
    /* Единственная раскладка, одинаково понятная и свежему клиенту, и старому корпоративному. */
    expect(letter()).toContain('<table');
  });

  it('абзацы текста переносятся в письмо, а не слипаются в один', () => {
    const html = letter();
    expect((html.match(/<p /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('в подвале сказано, что отвечать не нужно', () => {
    /* Без этого человек отвечает на служебный адрес, и его вопрос не читает никто. */
    expect(letter()).toMatch(/отвечать на него не нужно/i);
  });
});

describe('оформление подключено к рассылке (а не построено и брошено)', () => {
  const dispatcher = readFileSync(join(HERE, 'notification-dispatcher.service.ts'), 'utf8');

  it('рассыльщик собирает оформленную часть и отдаёт её почтовику', () => {
    expect(dispatcher).toContain('brandedLetter(');
    expect(dispatcher, 'оформление собрано, но в письмо не попало').toMatch(/\n\s+html,/);
  });

  it('оформление собирается из того же текста, что и простая часть', () => {
    /* Два вида шаблона разошлись бы при первой же правке. */
    expect(dispatcher).toContain('body: rendered.body');
  });
});
