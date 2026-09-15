import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildEvent, createReporter } from './reporter';

/**
 * Сбор ошибок: что именно уходит наружу и что делает ненастроенный сбор (ТЗ 15.1, решение Р15).
 *
 * Р15 говорит: сервер сбора разворачивается СВОЙ, в РФ. Развернуть его — настройка владельца,
 * а не код. Значит код обязан вести себя честно в обоих состояниях: настроен — отправляет;
 * не настроен — **молчит и говорит об этом**, а не делает вид, что работает.
 *
 * Собираются три источника, как перечисляет ТЗ: необработанные исключения, ошибки запросов и
 * срабатывания перехватчика падений.
 */

describe('событие о сбое', () => {
  it('несёт текст, шаблон адреса и номер запроса', () => {
    const event = buildEvent({
      kind: 'render',
      error: new Error('не удалось показать карточку'),
      route: '/learners/lrn_8f3k2m1p',
      requestId: 'req_42'
    });

    expect(event.message).toContain('не удалось показать карточку');
    expect(event.route, 'код записи в адресе — персональные данные').toBe('/learners/{id}');
    expect(event.requestId, 'по номеру человек и разработчик находят один и тот же случай').toBe(
      'req_42'
    );
    expect(event.kind).toBe('render');
  });

  it('вычищает персональные данные из текста', () => {
    const event = buildEvent({
      kind: 'request',
      error: new Error('слушатель ivanov@uc.ru со СНИЛС 112-233-445 95 не найден'),
      route: '/learners'
    });

    expect(event.message).not.toContain('ivanov@');
    expect(event.message).not.toContain('112-233');
  });

  it('не отправляет ничего, кроме текста, стека, адреса и номера', () => {
    const event = buildEvent({
      kind: 'uncaught',
      error: new Error('сбой'),
      route: '/groups'
    });

    expect(
      Object.keys(event).sort(),
      'лишнее поле — это возможная утечка: значения данных наружу не уходят'
    ).toEqual(['kind', 'message', 'requestId', 'route', 'stack']);
  });
});

describe('ненастроенный сбор ведёт себя честно', () => {
  let warned: string[];

  beforeEach(() => {
    warned = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('без адреса сервера сбора ничего не отправляет', async () => {
    const send = vi.fn();
    const reporter = createReporter({ endpoint: '', send });

    await reporter.report({ kind: 'render', error: new Error('сбой'), route: '/groups' });

    expect(send, 'отправлять некуда — значит не отправляем').not.toHaveBeenCalled();
    expect(reporter.isEnabled()).toBe(false);
  });

  it('говорит об этом ОДИН раз, а не на каждую ошибку', async () => {
    const reporter = createReporter({ endpoint: '', send: vi.fn() });

    await reporter.report({ kind: 'render', error: new Error('раз'), route: '/a' });
    await reporter.report({ kind: 'render', error: new Error('два'), route: '/b' });

    expect(warned.filter((line) => line.includes('ошибок не настроен')).length).toBe(1);
  });

  it('с адресом — отправляет подготовленное событие', async () => {
    const send = vi.fn(async () => undefined);
    const reporter = createReporter({ endpoint: 'https://sbor.example/api', send });

    await reporter.report({
      kind: 'request',
      error: new Error('ошибка запроса'),
      route: '/courses/course_abc123'
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [endpoint, event] = send.mock.calls[0] as unknown as [string, { route: string }];
    expect(endpoint).toBe('https://sbor.example/api');
    expect(event.route).toBe('/courses/{id}');
  });

  it('сбой самой отправки не мешает работе человека', async () => {
    const send = vi.fn(async () => {
      throw new Error('сервер сбора недоступен');
    });
    const reporter = createReporter({ endpoint: 'https://sbor.example/api', send });

    await expect(
      reporter.report({ kind: 'uncaught', error: new Error('сбой'), route: '/a' })
    ).resolves.toBeUndefined();
  });
});
