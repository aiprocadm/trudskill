import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  REMINDER_DEFAULTS,
  REMINDER_SETTINGS_KEY,
  reminderMilestones
} from './reminder-settings.js';
import { ReminderSettingsService } from './reminder-settings.service.js';

/**
 * Пороги напоминаний — настройка центра с умолчаниями Р11 (ТЗ 11.3).
 *
 * **Как было.** Пороги стояли числами в коде (`RECERT_HORIZON_DAYS = 60`,
 * `LICENSE_EXPIRY_HORIZON_DAYS = 90`), хотя правило репозитория прямо требует обратного: всё,
 * что выглядит как срок или порог, — настройка со значением по умолчанию. Заодно у сроков
 * обучения стояло 14/7/1 против 14/3/1 решения Р11, и этого расхождения никто не замечал
 * (журнал 513).
 *
 * **Что закреплено.**
 *
 * 1. Умолчания совпадают с решением Р11 — слово в слово.
 * 2. Настройка центра выигрывает у умолчания, но **испорченная настройка не отключает
 *    напоминания молча**: любое непригодное значение откатывается к умолчанию.
 * 3. Источник значения ОДИН: своих числовых порогов в сканерах нет.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MVP = join(HERE, '..');

const withSettings = (kind: string, value: unknown): Record<string, unknown> => ({
  [REMINDER_SETTINGS_KEY]: { [kind]: value }
});

/** Все исходники модуля, кроме тестов. */
const sources = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

describe('пороги напоминаний — настройка, а не число в коде (ТЗ 11.3)', () => {
  it('умолчания совпадают с решением Р11', () => {
    expect([...REMINDER_DEFAULTS.courseDeadline], 'сроки обучения — за 14, 3 и 1 день').toEqual([
      1, 3, 14
    ]);
    expect([...REMINDER_DEFAULTS.recertification], 'переаттестация — за 60, 30 и 7').toEqual([
      7, 30, 60
    ]);
    expect([...REMINDER_DEFAULTS.knowledgeRetest], 'повторная проверка — за 14, 7 и 3').toEqual([
      3, 7, 14
    ]);
    // Лицензия центра намеренно шире: её продление занимает месяцы.
    expect([...REMINDER_DEFAULTS.licenseExpiry]).toEqual([7, 30, 90]);
  });

  it('настройка центра выигрывает у умолчания', () => {
    expect(reminderMilestones('courseDeadline', withSettings('courseDeadline', [2, 10]))).toEqual([
      2, 10
    ]);
  });

  it('настройка приводится к порядку: по возрастанию, без повторов', () => {
    expect(
      reminderMilestones('recertification', withSettings('recertification', [30, 7, 30]))
    ).toEqual([7, 30]);
  });

  it('испорченная настройка НЕ отключает напоминания молча', () => {
    const cases: unknown[] = [[], ['30'], [0], [-5], [1.5], [400], 'тридцать', null, { days: 30 }];
    for (const value of cases) {
      expect(
        reminderMilestones('courseDeadline', withSettings('courseDeadline', value)),
        `непригодная настройка ${JSON.stringify(value)} обязана откатиться к умолчанию`
      ).toEqual(REMINDER_DEFAULTS.courseDeadline);
    }
    expect(reminderMilestones('courseDeadline', undefined)).toEqual(
      REMINDER_DEFAULTS.courseDeadline
    );
  });

  it('годные значения из смешанного списка сохраняются', () => {
    // Человек мог перечислить лишнее: отбрасываем негодное, но не весь список.
    expect(
      reminderMilestones('courseDeadline', withSettings('courseDeadline', [7, 'x', -1]))
    ).toEqual([7]);
  });

  it('больше четырёх напоминаний об одном событии не шлём', () => {
    expect(
      reminderMilestones('recertification', withSettings('recertification', [1, 2, 3, 4, 5, 6])),
      'это уже навязчивость, а не забота'
    ).toEqual([1, 2, 3, 4]);
  });

  it('без настроек центра служба отдаёт умолчания, а не молчит', async () => {
    const service = new ReminderSettingsService();
    expect(await service.milestones('tenant_1', 'courseDeadline')).toEqual(
      REMINDER_DEFAULTS.courseDeadline
    );
  });

  it('ошибка чтения настроек не оставляет людей без предупреждения', async () => {
    const broken = {
      getSettings: async () => {
        throw new Error('нет настроек у центра');
      }
    };
    const service = new ReminderSettingsService(broken as never);
    expect(await service.milestones('tenant_1', 'recertification')).toEqual(
      REMINDER_DEFAULTS.recertification
    );
  });

  it('своих числовых порогов в сканерах не осталось', () => {
    /*
     * Замер по всему модулю: правило «пороги — настройка» соблюдается, только если числа
     * действительно негде взять. Ищем объявления вида `const *_DAYS = 90`.
     */
    const offenders = sources(MVP)
      .filter((file) => !file.endsWith('reminder-settings.ts'))
      /*
       * Дашборды сюда не входят намеренно: `DEADLINE_HORIZON_DAYS` на экране методиста — это
       * «какие сроки показывать ближайшими», а не «за сколько дней слать письмо». Разные
       * вопросы с разной ценой ошибки; смешивать их в одну настройку значило бы менять экран,
       * подкручивая рассылку. Само это число тоже просится в настройки — записано в журнал
       * (514) и сделается той задачей, которая тронет экран методиста.
       */
      .filter((file) => !file.includes(`${join('dashboards', '')}`))
      .filter((file) =>
        /(?:HORIZON|MILESTONE|REMINDER)[A-Z_]*_DAYS\s*=\s*\d+/.test(readFileSync(file, 'utf8'))
      )
      .map((file) => file.slice(MVP.length + 1));

    expect(offenders, 'порог числом в коде обходит настройку центра').toEqual([]);
  });
});
