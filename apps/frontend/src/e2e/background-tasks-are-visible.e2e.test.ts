import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import {
  FALLBACK_STATUS_LABEL,
  KEEP_WORKING_HINT,
  isFinished,
  progressText
} from '../features/background-tasks/model';
import { navigationModel, routeMeta } from '../features/navigation/model';

/**
 * Долгую операцию видно в разделе «Фоновые задачи» (ТЗ 12.2).
 *
 * **Как было.** Очередь, воркер и карантин построены; массовое зачисление уходит в очередь и
 * возвращает человеку НОМЕР СООБЩЕНИЯ. Где посмотреть, что с ним стало, не сказано нигде: экран
 * «Эксплуатация» показывает ЗАСТРЯВШИЕ сообщения, а не «моя задача выполняется / готово»
 * (журнал 518).
 *
 * **Что закреплено.**
 *
 * 1. Раздел существует, называется «Фоновые задачи» и доступен без особого права: иначе человек
 *    отправил бы задачу, о судьбе которой не может узнать.
 * 2. Постановка в очередь заводит запись в реестре — иначе задача пропадает из виду.
 * 3. Состояния говорят человеческими словами; слова «джоб» на экране нет (ТЗ 4.2).
 * 4. Человеку прямо сказано, что вкладку держать не нужно.
 */

const SCREEN = fromApp('src', 'features', 'background-tasks', 'background-tasks-screen.tsx');
const ENQUEUE = fromApp('..', 'backend', 'src', 'modules', 'mvp', 'mvp-bulk-enqueue.service.ts');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

describe('фоновые задачи видно (ТЗ 12.2)', () => {
  it('раздел есть в меню и называется по-человечески', () => {
    const item = navigationModel.find((one) => one.href === '/admin/background-tasks');
    expect(item?.label).toBe('Фоновые задачи');
    /*
     * Своего права у раздела нет — он показывает СВОИ задачи. Но и всем подряд его показывать
     * нельзя: представитель заказчика фоновых задач не ставит. Берётся право того, кто их
     * создаёт (журнал 519 — первая редакция показывала раздел вообще всем).
     */
    expect(item?.requiredPermissions).toEqual(['enrollments.write']);
  });

  it('маршрут раздела знаком карте доступа', () => {
    const route = routeMeta.find((one) => one.pattern === '/admin/background-tasks');
    expect(route?.meta.public, 'аноним сюда не ходит').toBe(false);
    expect(route?.meta.requiredPermissions).toEqual(['enrollments.write']);
  });

  it('постановка в очередь заводит запись в реестре', () => {
    /*
     * Главная проверка задачи. Без записи человек получает номер сообщения и не знает, куда
     * смотреть, — ровно то состояние, из-за которого написана 12.2.
     */
    const enqueue = read(ENQUEUE);
    expect(/this\.tasks\?\.start\(/.test(enqueue), 'задача обязана попадать в реестр').toBe(true);
    expect(enqueue, 'вид операции назван в терминах продукта').toContain("kind: 'bulk_enrollment'");
    expect(
      enqueue.indexOf('await this.tasks?.start('),
      'запись заводится ПОСЛЕ публикации: иначе человек ждал бы задачу, которой в очереди нет'
    ).toBeGreaterThan(enqueue.indexOf('await this.rabbitMq.publish('));
  });

  it('состояния говорят человеческими словами', () => {
    expect(FALLBACK_STATUS_LABEL.queued).toBe('В очереди');
    expect(FALLBACK_STATUS_LABEL.running).toBe('Выполняется');
    expect(FALLBACK_STATUS_LABEL.succeeded).toBe('Готово');
    expect(FALLBACK_STATUS_LABEL.failed).toBe('Не выполнена');

    const screen = read(SCREEN);
    for (const word of ['джоб', 'job', 'queued', 'succeeded']) {
      expect(
        screen.toLowerCase().includes(`>${word}`),
        `техническое слово «${word}» на экран не попадает (ТЗ 4.2)`
      ).toBe(false);
    }
  });

  it('подписи берутся с сервера, а свои — только запасные', () => {
    /*
     * Теми же словами пользуются письмо и уведомление в колокольчике. Свой словарь на экране
     * однажды разошёлся бы с ними при одном и том же состоянии.
     */
    const screen = read(SCREEN);
    expect(/labels\.data\?\.statuses\?\.\[task\.status\]/.test(screen)).toBe(true);
    expect(screen, 'запасной словарь нужен, чтобы место не пустовало').toContain(
      'FALLBACK_STATUS_LABEL[task.status]'
    );
  });

  it('человеку сказано, что вкладку держать не нужно', () => {
    expect(KEEP_WORKING_HINT).toContain('можно закрыть страницу');
    expect(read(SCREEN)).toContain('KEEP_WORKING_HINT');
  });

  it('«0 из 0» не выдаётся за прогресс', () => {
    expect(progressText({ doneCount: 3, totalCount: 10 })).toBe('3 из 10');
    expect(
      progressText({ doneCount: 0, totalCount: 0 }),
      'объём бывает заранее неизвестен — честнее прочерк, чем ноль'
    ).toBe('—');
  });

  it('завершённость считает одно правило', () => {
    expect(isFinished('succeeded')).toBe(true);
    expect(isFinished('failed')).toBe(true);
    expect(isFinished('queued')).toBe(false);
    expect(isFinished('running')).toBe(false);
  });

  it('план фазы 12 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-19-stabux-phase-12-mass-data.md'
      ),
      'utf8'
    );
    expect(plan).toContain('12.2');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Срез 1');
  });
});
