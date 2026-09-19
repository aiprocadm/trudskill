import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { deviceRu, failureReasonRu, methodRu, toLoginHistoryEntry } from './login-history.js';
import {
  DEFAULT_LOGIN_PROTECTION,
  lockedMessage,
  loginFailureKey,
  loginLockKey,
  minutesWord,
  resolveLoginProtection,
  shouldLock
} from './login-protection.js';

/**
 * Защита входа и журнал входов (ТЗ «Стабилизация, UX и развитие», 17.1).
 *
 * **Что было.** Частота ограничивалась ПО АДРЕСУ отправителя: двадцать пять попыток в минуту.
 * От подбора это не спасает. Во-первых, ограничение общее на весь вход — двадцать пять попыток,
 * распределённые по разным учётным записям, его не трогают вовсе. Во-вторых, адрес меняется: у
 * подбирающего их обычно много, а у учебного центра за общим выходом в интернет наоборот один
 * на всех, и честные сотрудники мешают друг другу.
 *
 * Хуже другое: в журнал аудита попадали только УСПЕШНЫЕ входы. По нему нельзя было увидеть ни
 * подбора, ни того, что человек сам не может войти, — а именно эти две записи и нужны, когда
 * что-то пошло не так (журнал 573).
 *
 * **Что закреплено.** Неудачи считаются по учётной записи, после серии вход временно
 * закрывается, каждая попытка пишется в журнал, а сам журнал говорит по-русски.
 */

const here = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(resolve(here, 'services', 'auth.service.ts'), 'utf8');

describe('счётчик неудач привязан к записи, а не к адресу (ТЗ 17.1)', () => {
  it('ключ считает по центру и логину', () => {
    expect(loginFailureKey('t1', 'Ivanov')).toBe('iam:login-failures:t1:ivanov');
  });

  it('регистр и пробелы не создают вторую запись', () => {
    /* Иначе десять попыток «Ivanov», «IVANOV» и « ivanov » считались бы как три разных. */
    expect(loginFailureKey('t1', '  IVANOV  ')).toBe(loginFailureKey('t1', 'ivanov'));
    expect(loginLockKey('t1', 'IvAnOv')).toBe(loginLockKey('t1', 'ivanov'));
  });

  it('счётчик и запрет — разные ключи', () => {
    /* Они живут разное время: счётчик — окно наблюдения, запрет — срок блокировки. */
    expect(loginFailureKey('t1', 'u')).not.toBe(loginLockKey('t1', 'u'));
  });
});

describe('пороги по умолчанию разумны (ТЗ 17.1)', () => {
  it('человеку хватает попыток, подбирающему — нет', () => {
    /*
     * Живой человек ошибается один-два раза. Десять попыток за четверть часа — это заведомо
     * больше, чем опечатки, и несопоставимо меньше, чем нужно для перебора даже слабого пароля.
     */
    expect(DEFAULT_LOGIN_PROTECTION.maxFailures).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_LOGIN_PROTECTION.maxFailures).toBeLessThanOrEqual(20);
  });

  it('блокировка временная, а не навсегда', () => {
    /*
     * Постоянная блокировка превратила бы защиту в оружие: подбирающий закрыл бы вход любому
     * человеку, просто назвав его логин десять раз подряд.
     */
    expect(DEFAULT_LOGIN_PROTECTION.lockMinutes).toBeGreaterThan(0);
    expect(DEFAULT_LOGIN_PROTECTION.lockMinutes).toBeLessThanOrEqual(60);
  });

  it('блокировка наступает ровно на пороге', () => {
    const settings = DEFAULT_LOGIN_PROTECTION;
    expect(shouldLock(settings.maxFailures - 1, settings)).toBe(false);
    expect(shouldLock(settings.maxFailures, settings)).toBe(true);
  });
});

describe('настройка центра не может отменить защиту (ТЗ 17.1)', () => {
  it('разумные значения принимаются', () => {
    expect(resolveLoginProtection({ maxFailures: 5, windowMinutes: 30, lockMinutes: 20 })).toEqual({
      maxFailures: 5,
      windowMinutes: 30,
      lockMinutes: 20
    });
  });

  it('значение вне границ заменяется умолчанием, а не принимается', () => {
    /*
     * Ноль попыток — это блокировка на первой же опечатке; тысяча — перебор снова возможен.
     * Настройка, введённая с ошибкой, не должна ни открывать вход настежь, ни запирать навсегда.
     */
    expect(resolveLoginProtection({ maxFailures: 0 }).maxFailures).toBe(
      DEFAULT_LOGIN_PROTECTION.maxFailures
    );
    expect(resolveLoginProtection({ maxFailures: 100_000 }).maxFailures).toBe(
      DEFAULT_LOGIN_PROTECTION.maxFailures
    );
    expect(resolveLoginProtection({ lockMinutes: -5 }).lockMinutes).toBe(
      DEFAULT_LOGIN_PROTECTION.lockMinutes
    );
  });

  it('мусор вместо настроек — работаем на умолчаниях', () => {
    expect(resolveLoginProtection(null)).toEqual(DEFAULT_LOGIN_PROTECTION);
    expect(resolveLoginProtection({ maxFailures: 'много' })).toEqual(DEFAULT_LOGIN_PROTECTION);
  });
});

describe('сообщение о блокировке говорит, что делать (ТЗ 17.1, TXT-004)', () => {
  it('называет срок и запасной путь', () => {
    const text = lockedMessage(14);
    expect(text).toContain('14');
    expect(text, 'человеку не сказали, что делать').toMatch(/восстановите пароль/i);
  });

  it('минуты склоняются по-русски', () => {
    /* «Через 2 минут» читается как машинный перевод и подрывает доверие к остальному тексту. */
    expect(minutesWord(1)).toBe('минуту');
    expect(minutesWord(2)).toBe('минуты');
    expect(minutesWord(5)).toBe('минут');
    expect(minutesWord(11), 'одиннадцать — исключение').toBe('минут');
    expect(minutesWord(21)).toBe('минуту');
    expect(minutesWord(22)).toBe('минуты');
  });

  it('меньше минуты — это «через 1 минуту», а не «через 0»', () => {
    expect(lockedMessage(0.2)).toContain('1 минуту');
  });
});

describe('каждая попытка входа попадает в журнал (ТЗ 17.1)', () => {
  it('неудача пишется отдельным действием', () => {
    expect(service, 'неудачный вход снова не оставляет следа').toContain("'auth.login_failed'");
  });

  it('неудача считается и для несуществующего логина', () => {
    /*
     * Иначе перебор чужих логинов ничем не ограничен, а сам факт «этот логин не считается»
     * выдаёт, что такого человека нет.
     */
    /*
     * Ищем ВЫЗОВ с настоящими доводами, а не любое соседство слов: прежний шаблон совпадал с
     * ОБЪЯВЛЕНИЕМ метода, где те же причины перечислены типом, и подсаженное удаление вызова
     * прошло мимо.
     */
    expect(service).toMatch(
      /registerLoginFailure\(\s*tenantId,\s*payload\.login,\s*'unknown_login'/
    );
  });

  it('успешный вход обнуляет серию', () => {
    expect(service).toMatch(/clearLoginFailures\(tenantId, payload\.login\)/);
  });

  it('блокировка проверяется ДО поиска пользователя', () => {
    /*
     * Иначе по времени ответа можно отличить существующий логин от несуществующего: поиск в
     * базе заметно дольше, чем отказ по блокировке.
     */
    const loginBody = service.slice(service.indexOf('async login('));
    const lockAt = loginBody.indexOf('assertLoginNotLocked');
    const lookupAt = loginBody.indexOf('findUserByLogin');
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt, 'проверка блокировки должна идти первой').toBeLessThan(lookupAt);
  });

  it('логин не записывается как действующее лицо', () => {
    /*
     * Логин при неудаче — это то, что ввёл посторонний. В поле «кто сделал» ему не место:
     * иначе журнал утверждал бы, что действие совершил человек, которого, возможно, и нет.
     */
    expect(service).toMatch(/actorId: userId \?\? 'anonymous'/);
  });
});

describe('журнал входов говорит по-русски (ТЗ 17.1)', () => {
  it('причина отказа — словами, а не кодом', () => {
    expect(failureReasonRu('wrong_password')).toBe('Неверный пароль');
    expect(failureReasonRu('unknown_login')).toBe('Такого логина нет');
    expect(failureReasonRu('user_blocked')).toBe('Учётная запись заблокирована');
  });

  it('незнакомая причина не показывает сырой код', () => {
    /* Правило продукта: ни одного сырого кода как значения. */
    expect(failureReasonRu('weird_new_reason')).toBe('Вход не выполнен');
    expect(failureReasonRu(undefined)).toBe('Вход не выполнен');
  });

  it('способ входа назван понятно', () => {
    expect(methodRu('auth.magic_link_login')).toBe('Ссылка из письма');
    expect(methodRu('auth.esia_login')).toBe('Госуслуги');
    expect(methodRu('auth.login')).toBe('Пароль');
  });

  it('устройство описывается парой слов, а не строкой браузера', () => {
    /*
     * Точная модель телефона человеку не нужна. Нужен ответ на вопрос «это был я со своего
     * рабочего компьютера или кто-то с чужого телефона».
     */
    expect(deviceRu('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120 Safari/537.36')).toBe(
      'Chrome, Windows'
    );
    expect(deviceRu('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(
      'Safari, iPhone или iPad'
    );
    expect(deviceRu('Mozilla/5.0 (Linux; Android 14) YaBrowser/23.1')).toBe(
      'Яндекс Браузер, Android'
    );
  });

  it('неузнанная строка не показывается как есть', () => {
    expect(deviceRu('какой-то-робот/1.0')).toBe('Неизвестное устройство');
    expect(deviceRu(undefined)).toBe('Неизвестное устройство');
    expect(deviceRu('')).toBe('Неизвестное устройство');
  });

  it('запись журнала собирается целиком', () => {
    const entry = toLoginHistoryEntry({
      action: 'auth.login_failed',
      createdAt: '2026-09-20T10:00:00.000Z',
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Firefox/120',
      metadata: { reason: 'wrong_password' }
    });
    expect(entry).toEqual({
      at: '2026-09-20T10:00:00.000Z',
      outcome: 'Неудачная попытка',
      reason: 'Неверный пароль',
      ip: '10.0.0.1',
      device: 'Firefox, Windows'
    });
  });

  it('у успешного входа нет причины отказа, но есть способ', () => {
    const entry = toLoginHistoryEntry({
      action: 'auth.magic_link_login',
      createdAt: '2026-09-20T10:00:00.000Z'
    });
    expect(entry.outcome).toBe('Успешный вход');
    expect(entry.reason).toBeUndefined();
    expect(entry.method).toBe('Ссылка из письма');
  });
});
