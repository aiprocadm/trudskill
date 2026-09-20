import { describe, expect, it, vi } from 'vitest';

import { KnowledgeRetestScanner, dayCount } from './knowledge-retest-scanner.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Напоминания о повторной проверке знаний (ТЗ 11.3 + 10.4, решения Р11 и Р9; журнал 596).
 *
 * **Что здесь проверяется, и почему именно это.** Пороги «за 14, 7 и 3 дня» были объявлены в
 * настройках и даже закреплены тестом — а слать их было некому: сканера не существовало.
 * Тест проходил, потому что проверял ЧИСЛА, а не то, что по ним кто-то работает. Поэтому
 * здесь проверяется ПОВЕДЕНИЕ: письмо ушло, ушло тому, кому надо, и ушло один раз.
 */

const T = 'tenant_a';

const makeState = (): InMemoryMvpState =>
  ({
    learners: [
      {
        id: 'l1',
        tenantId: T,
        lastName: 'Иванов',
        firstName: 'Пётр',
        email: 'ivanov@example.ru',
        linkedIamUserId: 'u1'
      },
      { id: 'l2', tenantId: T, lastName: 'Петров', firstName: 'Иван' }
    ],
    notificationStaffRecipients: []
  }) as unknown as InMemoryMvpState;

/*
 * ТЗ 11.3: сканер больше не отправляет сам, а КЛАДЁТ повод в копилку — письма уходят одним на
 * человека в конце обхода. Проверяемые свойства от этого не изменились: кому, по какому поводу
 * и с каким ключом подавления повтора. Изменилось только то, КУДА это кладётся.
 */
const makeScanner = (
  tasks: Array<Record<string, unknown>>,
  milestones: readonly number[] = [3, 7, 14]
) => {
  const queued: Array<Record<string, unknown>> = [];
  const queue = vi.fn((_tenantId: string, item: Record<string, unknown>) => {
    queued.push(item);
  });
  const scanner = new KnowledgeRetestScanner(
    { queue } as never,
    { milestones: vi.fn().mockResolvedValue(milestones) } as never,
    { retakes: vi.fn().mockResolvedValue(tasks) } as never
  );
  return { scanner, queue, queued };
};

const task = (over: Record<string, unknown> = {}) => ({
  learnerId: 'l1',
  learnerName: 'Иванов Пётр',
  testId: 't1',
  testTitle: 'Охрана труда — итоговая',
  failedAt: '2026-09-01T10:00:00.000Z',
  dueAt: '2026-10-01T00:00:00.000Z',
  daysLeft: 7,
  overdue: false,
  ...over
});

describe('напоминание о повторной проверке уходит (ТЗ 11.3 + 10.4)', () => {
  it('за 7 дней до срока повод попадает в копилку', async () => {
    const { scanner, queue } = makeScanner([task()]);
    const summary = await scanner.scanTenant(T, '2026-09-24', makeState());
    expect(summary.remindersQueued).toBe(1);
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it('до самого дальнего порога письма нет', async () => {
    /*
     * Правило порогов: берётся САМЫЙ БЛИЗКИЙ порог, в который срок уже попадает. За 11 дней
     * до срока это ещё порог «за 14» — письмо уходит, и это верно. А за два месяца до срока
     * не уходит ничего: иначе напоминание превращается в фоновый шум и его перестают читать.
     */
    const { scanner, queue } = makeScanner([task()]);
    await scanner.scanTenant(T, '2026-08-01', makeState());
    expect(queue).not.toHaveBeenCalled();
  });

  it('письмо уходит слушателю, а копия — сотрудникам центра', async () => {
    /*
     * По пункту 79 Порядка № 2464 повторную проверку организует ЦЕНТР: назначает дату,
     * собирает комиссию. Письмо одному слушателю оставило бы центр в неведении о том, что у
     * него копится долг по срокам.
     */
    const state = makeState();
    (state as unknown as { notificationStaffRecipients: unknown[] }).notificationStaffRecipients = [
      { tenantId: T, email: 'admin@example.ru', kind: 'admin' }
    ];
    const { scanner, queued } = makeScanner([task()]);
    await scanner.scanTenant(T, '2026-09-24', state);
    const kinds = queued.map((item) => (item.digest as { recipientKind: string }).recipientKind);
    expect(kinds).toContain('learner');
    expect(kinds).toContain('admin');
  });

  it('без почты и без сотрудников письма нет, но и падения нет', async () => {
    const { scanner, queue } = makeScanner([task({ learnerId: 'l2' })]);
    await expect(scanner.scanTenant(T, '2026-09-24', makeState())).resolves.toEqual({
      remindersQueued: 0
    });
    expect(queue).not.toHaveBeenCalled();
  });

  it('в ключе повтора есть дата срока — перенос проверки будит напоминание заново', async () => {
    /*
     * Без даты в ключе порог, отработавший по СТАРОМУ сроку, был бы подавлен навсегда: центр
     * перенёс проверку, а человек об этом не узнал. Та же грабля, что чинили у сроков
     * обучения и лицензий (§5.150).
     */
    const { scanner, queued } = makeScanner([task()]);
    await scanner.scanTenant(T, '2026-09-24', makeState());
    expect((queued[0]!.digest as { dedupKey: string }).dedupKey).toBe('retest:l1:t1:2026-10-01:7');
  });

  it('пороги берутся из настроек центра, а не из кода', async () => {
    /*
     * Настройка, а не константа, — правило репозитория про всё, что выглядит как срок. Центр,
     * сузивший пороги до трёх дней, за неделю до срока письма не получает; центр с порогом в
     * неделю — получает. Одни и те же данные, разный результат: значит настройка действует.
     */
    const narrow = makeScanner([task()], [3]);
    await narrow.scanner.scanTenant(T, '2026-09-24', makeState());
    expect(narrow.queue).not.toHaveBeenCalled();

    const wide = makeScanner([task()], [7]);
    await wide.scanner.scanTenant(T, '2026-09-24', makeState());
    expect(wide.queue).toHaveBeenCalledTimes(1);
  });

  it('срок берётся у службы итогов, а не считается заново', async () => {
    /*
     * Тридцать дней — требование пункта 79, и оно уже посчитано для экрана слушателя и
     * списка центра. Второй расчёт разошёлся бы с первым молча: письмо говорило бы одну
     * дату, экран — другую.
     */
    const { scanner, queued } = makeScanner([task({ dueAt: '2026-10-01T00:00:00.000Z' })]);
    await scanner.scanTenant(T, '2026-09-24', makeState());
    expect((queued[0]!.variables as { dueDate: string }).dueDate).toBe('2026-10-01');
  });

  it('оба повода попадают в копилку, а не теряются по дороге', async () => {
    /*
     * Прежде здесь проверялся частичный успех отправки: один отказ почтовика не отменял
     * остальных. С переходом на копилку (ТЗ 11.3) сканер не отправляет вовсе, и проверять
     * ему нечего — устойчивость отправки переехала в саму копилку и проверяется её тестом.
     * Здесь остаётся то, за что отвечает сканер: он не теряет поводы.
     */
    const { scanner, queued } = makeScanner([task(), task({ testId: 't2' })], [7]);
    const summary = await scanner.scanTenant(T, '2026-09-24', makeState());
    expect(summary.remindersQueued).toBe(2);
    expect(queued).toHaveLength(2);
  });
});

describe('сколько дней осталось — словами (ТЗ 4.2: ни одного сырого значения)', () => {
  it('склонение', () => {
    expect(dayCount(1)).toBe('1 день');
    expect(dayCount(3)).toBe('3 дня');
    expect(dayCount(7)).toBe('7 дней');
    expect(dayCount(14)).toBe('14 дней');
    expect(dayCount(21)).toBe('21 день');
  });

  it('последний день назван словами, а не нулём', () => {
    /* «Осталось 0 дней» человек читает как ошибку системы. */
    expect(dayCount(0)).toBe('сегодня последний день');
    expect(dayCount(-2)).toBe('сегодня последний день');
  });
});
