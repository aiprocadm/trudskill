import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SafeMailer, createMailer, mailRouting } from './safe-mailer.js';

import type { EmailMessage, MailerService, SendResult } from './mailer.service.js';

/**
 * Со стенда нельзя случайно разослать письма живым людям (ТЗ 11.2 п.4).
 *
 * **Чем это опасно.** Стенд работает на копии данных: настоящие фамилии, настоящие адреса.
 * Включил почту «на посмотреть» — и сотни человек получили письмо о курсе, на который их никто
 * не записывал. Отозвать отправленное нельзя (журнал 511).
 *
 * **Что закреплено.**
 *
 * 1. Вне рабочего окружения письмо не уходит по своему адресу НИКОГДА.
 * 2. Без адреса-приёмника письмо не отправляется вовсе, и это видно в журнале писем как отказ
 *    с причиной, а не как успешная отправка.
 * 3. Транспорт собирает ОДНА фабрика: своя сборка в модуле — это обход защиты (журнал 512).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = join(HERE, '..', '..');

/** Транспорт-запись: письма никуда не уходят, но видно, что именно ему отдали. */
class RecordingMailer implements MailerService {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<SendResult> {
    this.sent.push(message);
    return { status: 'sent' };
  }
}

const letter: EmailMessage = {
  to: 'ivanov@example.ru',
  subject: 'Вас записали на курс',
  body: 'Здравствуйте!',
  templateKey: 'enrollment_invite'
};

/** Все файлы исходников бэкенда, кроме тестов. */
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

describe('со стенда письма живым людям не уходят (ТЗ 11.2)', () => {
  it('в рабочем окружении письмо идёт по своему адресу', () => {
    expect(mailRouting({ production: true, to: 'ivanov@example.ru' })).toEqual({
      kind: 'deliver',
      to: 'ivanov@example.ru'
    });
  });

  it('вне рабочего окружения письмо уходит только на адрес-приёмник', () => {
    expect(
      mailRouting({ production: false, redirectTo: 'stand@trudskill.ru', to: 'ivanov@example.ru' })
    ).toEqual({ kind: 'redirect', to: 'stand@trudskill.ru', original: 'ivanov@example.ru' });
  });

  it('без адреса-приёмника письмо не отправляется вовсе — это умолчание', () => {
    const routing = mailRouting({ production: false, to: 'ivanov@example.ru' });
    expect(routing.kind, 'когда непонятно, безопаснее промолчать, чем разослать').toBe('blocked');
    expect(routing.kind === 'blocked' && routing.reason).toContain('MAIL_REDIRECT_TO');
    // Пустая строка и пробелы — то же самое, что «не задано»: настройку часто оставляют пустой.
    expect(mailRouting({ production: false, redirectTo: '   ', to: 'a@b.ru' }).kind).toBe(
      'blocked'
    );
  });

  it('перенаправленное письмо называет настоящего адресата', async () => {
    const inner = new RecordingMailer();
    const mailer = new SafeMailer(inner, { production: false, redirectTo: 'stand@trudskill.ru' });
    await mailer.send(letter);

    expect(inner.sent).toHaveLength(1);
    expect(inner.sent[0]?.to).toBe('stand@trudskill.ru');
    expect(inner.sent[0]?.subject, 'иначе на стенде непонятно, кому письмо').toContain(
      'ivanov@example.ru'
    );
    expect(inner.sent[0]?.body).toContain('ivanov@example.ru');
  });

  it('заблокированное письмо не выдаётся за отправленное', async () => {
    const inner = new RecordingMailer();
    const result = await new SafeMailer(inner, { production: false }).send(letter);

    expect(inner.sent, 'транспорт не должен получить письмо вовсе').toHaveLength(0);
    expect(result.status, 'журнал писем обязан показать отказ, а не успех').toBe('failed');
    expect(result.error).toBeTruthy();
  });

  it('выключенная почта остаётся выключенной', async () => {
    const mailer = createMailer({
      NODE_ENV: 'production',
      NOTIFICATIONS_EMAIL_ENABLED: false,
      SMTP_PORT: 587,
      SMTP_FROM: 'no-reply@trudskill.ru'
    });
    expect((await mailer.send(letter)).status).toBe('skipped_noop');
  });

  it('транспорт собирает одна фабрика — своей сборки в модулях нет', () => {
    /*
     * Замер по всему бэкенду, а не по двум известным местам: защита, которую обязан помнить
     * каждый, кто собирает транспорт, не работает. `new SmtpMailer(` допустим только внутри
     * самой фабрики (журнал 512).
     */
    const offenders = sources(BACKEND_SRC)
      .filter((file) => !file.endsWith(join('mailer', 'safe-mailer.ts')))
      .filter((file) => /new SmtpMailer\(/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(BACKEND_SRC.length + 1));

    expect(offenders, 'своя сборка транспорта обходит защиту стенда').toEqual([]);
  });

  it('настройка адреса-приёмника объявлена в схеме окружения', () => {
    const schema = readFileSync(join(BACKEND_SRC, 'env.schema.ts'), 'utf8');
    expect(schema, 'адрес — настройка, а не значение в коде').toContain('MAIL_REDIRECT_TO');
  });
});
