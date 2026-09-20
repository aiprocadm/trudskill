import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RECOVERY_THROTTLE,
  recoveryAllowed,
  recoveryThrottleAudit,
  recoveryWindowStart,
  resolveRecoveryThrottle
} from './recovery-throttle.js';
import { MagicLinkService } from './services/magic-link.service.js';

/**
 * Ограничение частоты восстановления доступа (ТЗ 17.1; журнал 599).
 *
 * **Что было.** Частота считалась ТОЛЬКО по сетевому адресу — пять запросов в минуту. Офис из
 * сорока человек делил этот предел на всех, а почтовый ящик человека не был защищён вовсе:
 * меняя адрес, можно засыпать чужую почту ссылками для входа без предела.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

describe('предел считается по учётной записи (ТЗ 17.1)', () => {
  it('до предела пускает, на пределе — нет', () => {
    /*
     * Сравнение строгое: при пределе «3» третий запрос ещё проходит, четвёртый нет.
     * Нестрогое дало бы на одну ссылку больше, чем обещает настройка.
     */
    expect(recoveryAllowed(0, DEFAULT_RECOVERY_THROTTLE)).toBe(true);
    expect(recoveryAllowed(2, DEFAULT_RECOVERY_THROTTLE)).toBe(true);
    expect(recoveryAllowed(3, DEFAULT_RECOVERY_THROTTLE)).toBe(false);
    expect(recoveryAllowed(99, DEFAULT_RECOVERY_THROTTLE)).toBe(false);
  });

  it('окно отсчитывается назад от текущего момента', () => {
    const now = new Date(2026, 8, 20, 12, 0, 0, 0);
    const start = recoveryWindowStart(now, { maxPerWindow: 3, windowMinutes: 15 });
    expect(now.getTime() - start.getTime()).toBe(15 * 60_000);
  });
});

describe('предел — настройка центра, а не число в коде', () => {
  it('умолчания разумны для человека и тесны для заваливания почты', () => {
    /*
     * Письмо приходит за секунды, а ссылка живёт минуты: три запроса за четверть часа — это
     * заметно больше, чем нужно человеку, и заметно меньше, чем нужно для рассылки.
     */
    expect(DEFAULT_RECOVERY_THROTTLE.maxPerWindow).toBe(3);
    expect(DEFAULT_RECOVERY_THROTTLE.windowMinutes).toBe(15);
  });

  it('настройка центра действует', () => {
    const policy = resolveRecoveryThrottle({ maxPerWindow: 5, windowMinutes: 60 });
    expect(recoveryAllowed(4, policy)).toBe(true);
    expect(recoveryAllowed(5, policy)).toBe(false);
  });

  it('пустое значение — умолчание, а не ноль', () => {
    /*
     * Иначе `null` превращается в число 0, приводится к минимуму, и центр молча получает
     * предел в одну ссылку: человек, у которого первое письмо попало в спам, остаётся без
     * входа.
     */
    const policy = resolveRecoveryThrottle({ maxPerWindow: null, windowMinutes: '' });
    expect(policy).toEqual(DEFAULT_RECOVERY_THROTTLE);
  });

  it('границами защиту отменить нельзя', () => {
    /*
     * Настройку правит администратор центра, а страдает от её отмены посторонний человек,
     * чью почту завалят. Даже самый щедрый предел остаётся пределом.
     */
    expect(resolveRecoveryThrottle({ maxPerWindow: 0 }).maxPerWindow).toBe(1);
    expect(resolveRecoveryThrottle({ maxPerWindow: 9999 }).maxPerWindow).toBe(20);
    expect(resolveRecoveryThrottle({ windowMinutes: 0 }).windowMinutes).toBe(1);
    expect(resolveRecoveryThrottle({ windowMinutes: 99999 }).windowMinutes).toBe(1440);
  });
});

describe('форма не превращается в справочник сотрудников', () => {
  const controller = readFileSync(join(HERE, 'auth.controller.ts'), 'utf8');
  const service = readFileSync(join(HERE, 'services', 'magic-link.service.ts'), 'utf8');

  it('ответ один и тот же — и когда письмо ушло, и когда предел сработал', () => {
    /*
     * Отличающийся ответ позволил бы проверять, есть ли такой человек в системе и не
     * заваливают ли уже его почту. Поэтому наружу всегда уходит «отправлено».
     */
    const handler = controller.slice(controller.indexOf("@Post('auth/magic-link/request')"));
    const body = handler.slice(0, handler.indexOf('@Post(', 10));
    const answers = body.match(/return \{ status: '[^']+' \}/g) ?? [];
    expect(answers.length, 'ответ у ручки должен быть ровно один').toBe(1);
    expect(answers[0]).toContain("'sent'");
  });

  it('при сработавшем пределе письмо не отправляется', () => {
    expect(controller, 'письмо уходит даже при исчерпанном пределе').toMatch(
      /if \(rawToken\) \{[\s\S]*?sendMagicLink/
    );
  });

  it('при сработавшем пределе токен НЕ записывается', () => {
    /*
     * Записать токен и не отправить письмо было бы хуже бесполезного: каждая попытка
     * добавляла бы запись и продлевала бы наказание — предел перестал бы считаться верно.
     */
    const request = service.slice(service.indexOf('async requestLink'));
    const beforeSave = request.slice(0, request.indexOf('this.repo.save'));
    expect(beforeSave, 'проверка предела стоит после записи токена').toContain(
      'return { rawToken: null }'
    );
  });

  it('предел считается ПО АДРЕСУ человека, а не по сети', () => {
    expect(service).toContain('countRequestsSince');
  });
});

describe('служба правда отказывает после предела (ТЗ 17.1)', () => {
  /*
   * Проверка ПОВЕДЕНИЯ, а не чистой функции. Подсадка «`if (false)` вместо проверки предела»
   * проходила все прежние проверки: функция оставалась верной, исходник содержал нужные слова,
   * а служба выдавала ссылки без счёта.
   */
  const makeService = (recentCount: number) => {
    const saved: unknown[] = [];
    const repo = {
      async save(record: unknown) {
        saved.push(record);
      },
      async countRequestsSince() {
        return recentCount;
      },
      async findByHash() {
        return null;
      },
      async markConsumed() {
        return true;
      }
    };
    return { service: new MagicLinkService(repo as never, { ttlMs: 900_000 }), saved };
  };

  it('до предела ссылка выдаётся и записывается', async () => {
    const { service, saved } = makeService(2);
    const result = await service.requestLink({ tenantId: 't1', email: 'a@example.ru' });
    expect(result.rawToken).toBeTruthy();
    expect(saved).toHaveLength(1);
  });

  it('на пределе ссылки НЕТ и запись НЕ создаётся', async () => {
    /*
     * Записать токен и не отправить письмо было бы хуже бесполезного: каждая попытка
     * продлевала бы наказание, и предел перестал бы считаться верно.
     */
    const { service, saved } = makeService(3);
    const result = await service.requestLink({ tenantId: 't1', email: 'a@example.ru' });
    expect(result.rawToken).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('настройка центра действует и на службу', async () => {
    const { service } = makeService(3);
    const result = await service.requestLink({
      tenantId: 't1',
      email: 'a@example.ru',
      throttle: { maxPerWindow: 10, windowMinutes: 15 }
    });
    expect(result.rawToken).toBeTruthy();
  });
});

describe('журнал не превращается в список чужих адресов', () => {
  it('адрес почты в запись не попадает', () => {
    /*
     * Журнал читают сотрудники центра. По нему можно было бы собрать адреса, которые кто-то
     * пытается восстановить; достаточно знать, что предел сработал и сколько раз.
     */
    const record = recoveryThrottleAudit(7, DEFAULT_RECOVERY_THROTTLE);
    expect(JSON.stringify(record)).not.toMatch(/@/);
    expect(record.reason).toBe('recovery_rate_limited');
    expect(record.recentCount).toBe(7);
  });
});

describe('пороги защиты входа берутся из настроек центра (ТЗ 17.1)', () => {
  const auth = readFileSync(join(HERE, 'services', 'auth.service.ts'), 'utf8');

  it('служба входа читает настройку, а не берёт умолчания всегда', () => {
    /*
     * Найденный дрейф (журнал 600): `resolveLoginProtection` была написана и покрыта тестом,
     * в трекере числилось «пороги — настройка центра», а служба входа всегда брала
     * умолчания — функцию не звал НИКТО.
     */
    /*
     * Проверяем ВЫЗОВ В САМОМ методе учёта неудач, а не наличие имени функции в файле.
     * Подсадка «вернуть умолчания прямо в методе» прежнюю проверку проходила: имя
     * `resolveLoginProtection` оставалось в помощнике, который больше никто не звал.
     * Двенадцатый случай «сторож мерит слово, а не конструкцию».
     */
    const method = auth.slice(auth.indexOf('private async registerLoginFailure'));
    const body = method.slice(0, method.indexOf('await this.auditService'));
    expect(body, 'настройка центра снова не читается').toContain('this.loginProtectionFor(');
    expect(body, 'пороги снова взяты из кода, а не из настроек').not.toContain(
      'DEFAULT_LOGIN_PROTECTION'
    );
    expect(auth).toContain('LOGIN_PROTECTION_SETTINGS_KEY');
  });

  it('беда с чтением настроек не ломает вход', () => {
    /*
     * Настройки — подробность защиты, а вход — сама работа. Сломать вход из-за недоступной
     * таблицы настроек значит превратить мелкую неполадку в полную остановку центра.
     */
    const helper = auth.slice(auth.indexOf('private async loginProtectionFor'));
    expect(helper.slice(0, 700)).toMatch(/catch \{[\s\S]*?DEFAULT_LOGIN_PROTECTION/);
  });
});
