import { describe, expect, it, vi } from 'vitest';

import { type DigestItem, digestLetter, groupForDigest, humanDate } from './daily-digest.js';
import { ReminderOutbox } from './reminder-outbox.service.js';

/**
 * Не более одного письма в день на человека (ТЗ 11.3, решение Р11; журнал 601).
 *
 * **Что проверяется.** Три вещи, и каждая — про поведение, а не про наличие кода: писем ровно
 * столько, сколько людей; поводы не пропадают; отметка о каждом поводе сохраняется, иначе
 * завтра то же самое придёт снова.
 */

const T = 't1';

const item = (over: Partial<DigestItem> = {}): DigestItem => ({
  email: 'ivan@example.ru',
  recipientKind: 'learner',
  recipientName: 'Иванов Пётр',
  subjectName: 'Иванов Пётр',
  reasonTitle: 'Срок завершения обучения',
  about: 'Охрана труда',
  dueDate: '2026-10-01',
  dedupKey: 'deadline:enr1:2026-10-01:14',
  ...over
});

const makeOutbox = () => {
  const dispatch = vi.fn().mockResolvedValue({ sent: 1, skipped: 0, failed: 0 });
  const record = vi.fn().mockResolvedValue({ id: 'd1' });
  const outbox = new ReminderOutbox({ dispatch } as never, { record } as never);
  return { outbox, dispatch, record };
};

const queued = (digest: DigestItem, templateKey = 'course_deadline') => ({
  templateKey: templateKey as never,
  variables: { learnerName: digest.subjectName ?? '', courseTitle: digest.about },
  digest
});

describe('одно письмо на человека, сколько бы ни было поводов (ТЗ 11.3)', () => {
  it('один повод — прежнее письмо со своим текстом, а не список из одного пункта', async () => {
    /*
     * У каждого повода свой текст, написанный под него. Заворачивать одинокий повод в список
     * значит ухудшить самый частый случай ради редкого.
     */
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item()));
    const summary = await outbox.flush(T, '2026-09-20');

    expect(summary.lettersSent).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0].templateKey).toBe('course_deadline');
    expect(dispatch.mock.calls[0]![0].dedupKey).toBe('deadline:enr1:2026-10-01:14');
  });

  it('два повода одному человеку — ОДНО объединённое письмо', async () => {
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item()));
    outbox.queue(
      T,
      queued(
        item({
          reasonTitle: 'Повторная проверка знаний',
          about: 'Охрана труда — итоговая',
          dueDate: '2026-09-25',
          dedupKey: 'retest:l1:t1:2026-09-25:7'
        }),
        'knowledge_retest'
      )
    );
    const summary = await outbox.flush(T, '2026-09-20');

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0].templateKey).toBe('reminder_digest');
    expect(summary.lettersSent).toBe(1);
    expect(summary.reasonsCovered).toBe(2);
  });

  it('разным людям — разные письма', async () => {
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item()));
    outbox.queue(T, queued(item({ email: 'admin@uc.ru', recipientKind: 'admin' })));
    await outbox.flush(T, '2026-09-20');
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('один человек с разным написанием адреса — всё равно одно письмо', async () => {
    /* Иначе он получит два письма ровно в том случае, ради которого всё и делается. */
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item({ email: 'Ivan@Example.ru' })));
    outbox.queue(T, queued(item({ email: 'ivan@example.ru', dedupKey: 'other:1' })));
    await outbox.flush(T, '2026-09-20');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('один и тот же повод, попавший дважды, письма не удваивает', async () => {
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item()));
    outbox.queue(T, queued(item()));
    const summary = await outbox.flush(T, '2026-09-20');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(summary.reasonsCovered).toBe(1);
  });
});

describe('объединение не ломает подавление повторов (главная ловушка)', () => {
  it('у КАЖДОГО повода остаётся своя отметка', async () => {
    /*
     * Подавление повторов работает по журналу отправок: у каждого повода свой ключ, и именно
     * он не даёт порогу сработать дважды. Если записать только факт «объединённое письмо
     * ушло», то завтра те же пороги сработают снова, и человек будет получать одно и то же
     * каждый день до самого срока.
     */
    const { outbox, record } = makeOutbox();
    outbox.queue(T, queued(item()));
    outbox.queue(T, queued(item({ dedupKey: 'retest:l1:t1:2026-09-25:7' }), 'knowledge_retest'));
    await outbox.flush(T, '2026-09-20');

    const keys = record.mock.calls.map((call) => (call[0] as { dedupKey: string }).dedupKey);
    expect(keys).toContain('deadline:enr1:2026-10-01:14');
    expect(keys).toContain('retest:l1:t1:2026-09-25:7');
  });

  it('при одиночном письме отметку пишет сам рассыльщик — второй раз не надо', async () => {
    const { outbox, record } = makeOutbox();
    outbox.queue(T, queued(item()));
    await outbox.flush(T, '2026-09-20');
    expect(record).not.toHaveBeenCalled();
  });

  it('если письмо не ушло, отметки не пишутся', async () => {
    /* Иначе повод считался бы доставленным, а человек не узнал бы о нём никогда. */
    const dispatch = vi.fn().mockResolvedValue({ sent: 0, skipped: 1, failed: 0 });
    const record = vi.fn();
    const outbox = new ReminderOutbox({ dispatch } as never, { record } as never);
    outbox.queue(T, queued(item()));
    outbox.queue(T, queued(item({ dedupKey: 'x:2' })));
    await outbox.flush(T, '2026-09-20');
    expect(record).not.toHaveBeenCalled();
  });

  it('ключ объединённого письма — на человека и на ДЕНЬ', async () => {
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item()));
    outbox.queue(T, queued(item({ dedupKey: 'x:2' })));
    await outbox.flush(T, '2026-09-20');
    expect(dispatch.mock.calls[0]![0].dedupKey).toBe('digest:ivan@example.ru:2026-09-20');
  });
});

describe('копилка переживает отказы (ТЗ 11.3)', () => {
  it('отказ отправки одному не отменяет писем остальным', async () => {
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValue({ sent: 1, skipped: 0, failed: 0 });
    const outbox = new ReminderOutbox({ dispatch } as never, { record: vi.fn() } as never);
    outbox.queue(T, queued(item()));
    outbox.queue(T, queued(item({ email: 'admin@uc.ru', recipientKind: 'admin' })));
    const summary = await outbox.flush(T, '2026-09-20');
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(summary.lettersSent).toBe(1);
  });

  it('незаписанная отметка не отменяет письма', async () => {
    /*
     * Повод придёт ещё раз завтра — неприятно, но несравнимо лучше, чем уронить весь обход:
     * остальные люди не получили бы своих писем вовсе.
     */
    const dispatch = vi.fn().mockResolvedValue({ sent: 1, skipped: 0, failed: 0 });
    const record = vi.fn().mockRejectedValue(new Error('db down'));
    const outbox = new ReminderOutbox({ dispatch } as never, { record } as never);
    outbox.queue(T, queued(item()));
    outbox.queue(T, queued(item({ dedupKey: 'x:2' })));
    const summary = await outbox.flush(T, '2026-09-20');
    expect(summary.lettersSent).toBe(1);
  });

  it('копилка очищается: повторный обход не шлёт то же самое', async () => {
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item()));
    await outbox.flush(T, '2026-09-20');
    await outbox.flush(T, '2026-09-20');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('копилка не смешивает центры', async () => {
    /*
     * Иначе повод одного центра уехал бы в письме другого — утечка между центрами.
     *
     * Адреса у центров РАЗНЫЕ намеренно. С одинаковым адресом подсадка «брать все центры
     * разом» сливала бы поводы в одну группу и давала ровно один вызов — тот самый, которого
     * проверка и ждала. Проверка проходила бы при сломанной изоляции.
     */
    const { outbox, dispatch } = makeOutbox();
    outbox.queue(T, queued(item()));
    outbox.queue('t2', queued(item({ email: 'chужой@example.ru', dedupKey: 'x:2' })));
    await outbox.flush(T, '2026-09-20');

    expect(dispatch).toHaveBeenCalledTimes(1);
    const sentTo = dispatch.mock.calls.flatMap((call) =>
      (call[0].recipients as Array<{ email: string }>).map((one) => one.email)
    );
    expect(sentTo).toEqual(['ivan@example.ru']);
    expect(outbox.pending('t2')).toBe(1);
  });
});

describe('как выглядит объединённое письмо', () => {
  it('сроки идут по возрастанию — что горит раньше, то и выше', () => {
    const group = groupForDigest([
      item({ dueDate: '2026-11-01', reasonTitle: 'Переаттестация', dedupKey: 'a' }),
      item({ dueDate: '2026-09-25', reasonTitle: 'Повторная проверка знаний', dedupKey: 'b' })
    ])[0]!;
    const letter = digestLetter(group);
    expect(letter.body.indexOf('Повторная проверка')).toBeLessThan(
      letter.body.indexOf('Переаттестация')
    );
  });

  it('имя слушателя названо — администратор получает письмо про ЧУЖИЕ сроки', () => {
    /*
     * Имя ПОЛУЧАТЕЛЯ и имя того, КОГО касается срок, здесь разные намеренно. С одинаковыми
     * проверка проходила бы при пустом списке имён: имя получателя стоит ещё и в
     * приветствии, и `toContain` находило бы его там.
     */
    const group = groupForDigest([
      item({ recipientName: 'Администратор центра', dedupKey: 'a' }),
      item({ recipientName: 'Администратор центра', subjectName: 'Петров Иван', dedupKey: 'b' })
    ])[0]!;
    const body = digestLetter(group).body;
    expect(body).toContain('Иванов Пётр');
    expect(body).toContain('Петров Иван');
  });

  it('дата написана словами, а не числом', () => {
    /* ТЗ 4.2: ни одного сырого значения на экране и в письме. */
    expect(humanDate('2026-10-01')).toBe('1 октября');
  });

  it('в теме письма видно, сколько сроков', () => {
    const group = groupForDigest([item({ dedupKey: 'a' }), item({ dedupKey: 'b' })])[0]!;
    expect(digestLetter(group).subject).toContain('2');
  });
});
