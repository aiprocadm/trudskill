import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DRAFT_LIFETIME_DAYS,
  DRAFT_DISCARD_LABEL,
  DRAFT_RESTORE_LABEL,
  draftEnvelope,
  draftPrompt,
  readDraft,
  readDraftFrom,
  resolveDraftLifetimeDays,
  writeDraftTo
} from './local-draft';

/**
 * Черновик длинной формы с отметкой времени (ТЗ 10.3, журнал 591).
 *
 * **Главное здесь — не «есть черновик», а «человек понял, чей он и когда».** Форма,
 * наполнившаяся сама, неотличима от чужой работы: человек либо затирает нужное, либо создаёт
 * второй такой же курс. Отметка времени и есть ответ на «моё ли это».
 */

const at = (y: number, m: number, d: number, hh: number, mm: number): Date =>
  new Date(y, m - 1, d, hh, mm, 0, 0);

describe('что лежит в черновике (ТЗ 10.3)', () => {
  it('записанное читается обратно вместе со временем', () => {
    const now = at(2026, 9, 20, 14, 20);
    const raw = JSON.stringify(draftEnvelope({ title: 'Охрана труда' }, now));
    const state = readDraft<{ title: string }>(raw, now);
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.value.title).toBe('Охрана труда');
    expect(state.savedAt.getTime()).toBe(now.getTime());
  });

  it('испорченная запись — это «черновика нет», а не поломка формы', () => {
    /* Испорченное хранилище не должно мешать создавать курс. */
    expect(readDraft('не json', new Date()).status).toBe('none');
    expect(readDraft('null', new Date()).status).toBe('none');
    expect(readDraft(null, new Date()).status).toBe('none');
  });

  it('запись прежнего вида — без отметки времени — не предлагается', () => {
    /*
     * Предложить её нечем: без времени человеку не на что опереться в ответе «моё ли это».
     * Молча подставить — та самая беда, ради которой задача и заведена.
     */
    expect(readDraft(JSON.stringify({ title: 'Старый' }), new Date()).status).toBe('none');
  });

  it('запись с отметкой времени, но без данных — тоже «черновика нет»', () => {
    /*
     * Иначе мастер предложит восстановить ПУСТОТУ: плашка появится, человек согласится, а
     * форма останется пустой — и он решит, что потерял работу.
     */
    expect(
      readDraft(JSON.stringify({ savedAt: new Date().toISOString() }), new Date()).status
    ).toBe('none');
  });

  it('просроченный черновик помечен отдельно, чтобы его стёрли', () => {
    /*
     * Работу недельной давности человек уже не помнит: предложить её — значит подсунуть
     * незнакомый текст под видом своего. Лучше чистая форма.
     */
    const saved = at(2026, 9, 1, 10, 0);
    const raw = JSON.stringify(draftEnvelope({ title: 'Давно' }, saved));
    expect(readDraft(raw, at(2026, 9, 20, 10, 0)).status).toBe('stale');
  });

  it('свежий черновик предлагается', () => {
    const saved = at(2026, 9, 20, 9, 0);
    const raw = JSON.stringify(draftEnvelope({ title: 'Свежий' }, saved));
    expect(readDraft(raw, at(2026, 9, 20, 14, 0)).status).toBe('ready');
  });

  it('отметка из будущего считается негодной', () => {
    /* Переведённые часы или чужая машина — такой записи верить нельзя. */
    const raw = JSON.stringify(draftEnvelope({ title: 'Завтра' }, at(2026, 9, 21, 10, 0)));
    expect(readDraft(raw, at(2026, 9, 20, 10, 0)).status).toBe('stale');
  });
});

describe('срок жизни черновика — настройка, а не константа (правило ТЗ о числах)', () => {
  it('по умолчанию неделя', () => {
    expect(DEFAULT_DRAFT_LIFETIME_DAYS).toBe(7);
  });

  it('настройку можно изменить, и она действует', () => {
    const saved = at(2026, 9, 18, 10, 0);
    const raw = JSON.stringify(draftEnvelope({ x: 1 }, saved));
    const now = at(2026, 9, 20, 10, 0);
    expect(readDraft(raw, now, 1).status).toBe('stale');
    expect(readDraft(raw, now, 30).status).toBe('ready');
  });

  it('непонятное значение настройки — это умолчание, а не отключённая защита', () => {
    /* Опечатка в настройке не должна незаметно отнимать черновик. */
    expect(resolveDraftLifetimeDays('абракадабра')).toBe(DEFAULT_DRAFT_LIFETIME_DAYS);
    expect(resolveDraftLifetimeDays(undefined)).toBe(DEFAULT_DRAFT_LIFETIME_DAYS);
  });

  it('значение приводится к допустимому', () => {
    expect(resolveDraftLifetimeDays(0)).toBe(1);
    expect(resolveDraftLifetimeDays(-5)).toBe(1);
    expect(resolveDraftLifetimeDays(1000)).toBe(90);
  });
});

describe('как черновик предлагается человеку (ТЗ 10.3)', () => {
  it('сегодняшний назван временем', () => {
    expect(draftPrompt(at(2026, 9, 20, 14, 20), at(2026, 9, 20, 18, 0))).toBe(
      'Черновик от 14:20 — восстановить?'
    );
  });

  it('вчерашний и старше назван датой', () => {
    /*
     * «Черновик от 14:20» про позавчерашнюю работу вводит в заблуждение сильнее, чем
     * молчание: человек прочитает это как «двадцать минут назад» и восстановит не глядя.
     */
    expect(draftPrompt(at(2026, 9, 18, 9, 5), at(2026, 9, 20, 18, 0))).toBe(
      'Черновик от 18 сентября, 09:05 — восстановить?'
    );
  });

  it('у ответа названы оба исхода, а не «да» и «нет»', () => {
    expect(DRAFT_RESTORE_LABEL).toMatch(/восстановить/i);
    expect(DRAFT_DISCARD_LABEL).toMatch(/заново/i);
  });
});

describe('хранилище браузера может отказать (ТЗ 10.3)', () => {
  const throwing = {
    getItem: () => {
      throw new Error('доступ запрещён');
    },
    setItem: () => {
      throw new Error('переполнено');
    }
  };

  it('отказ чтения — форма открывается без черновика', () => {
    /* Приватное окно и запрет на данные сайта бросают исключение прямо при обращении. */
    expect(readDraftFrom(throwing, 'ключ', new Date()).status).toBe('none');
  });

  it('отказ записи не роняет форму', () => {
    expect(() => writeDraftTo(throwing, 'ключ', { x: 1 }, new Date())).not.toThrow();
  });

  it('без хранилища вообще (отрисовка на сервере) — тоже не падает', () => {
    expect(readDraftFrom(undefined, 'ключ', new Date()).status).toBe('none');
    expect(() => writeDraftTo(undefined, 'ключ', { x: 1 }, new Date())).not.toThrow();
  });
});
