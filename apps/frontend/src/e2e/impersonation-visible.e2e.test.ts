import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import {
  IMPERSONATION_CONFIRM_NOTE,
  impersonationBanner,
  impersonationConfirmNote,
  isImpersonating
} from '../features/impersonation/model';

import type { UserSession } from '../../src/entities/session/model';

/**
 * Режим «Войти от имени» видим (ТЗ «Стабилизация, UX и развитие», 13.5).
 *
 * **Как было.** Механизм сделан правильно: вход пишется в журнал, признак живёт в сессии и
 * попадает в журнал на КАЖДОМ последующем действии. Но в интерфейсе режим был невидим:
 * `auth/me` признак не отдавал вовсе. Человек из поддержки работал в чужом кабинете и ничем не
 * отличал это от собственного, а сотрудник центра потом видел в журнале действия, которых не
 * совершал (журнал 551).
 *
 * **Что закреплено.**
 *
 * 1. Признак берётся из сессии, а не выводится по ролям: в этом режиме роль ровно та же, что у
 *    настоящего сотрудника центра.
 * 2. Полоса называет центр, роль и говорит, что действия попадут в журнал как действия поддержки.
 * 3. Полоса живёт в ОБОЛОЧКЕ — значит над любой страницей кабинета, включая будущие.
 * 4. Пометку получает КАЖДОЕ подтверждение: признак кладётся один раз контекстом, а не
 *    передаётся свойством в десяток вызовов.
 */

const sessionOf = (impersonatedBy?: string): UserSession =>
  ({
    user: {
      id: 'u1',
      tenantId: 'tenant_demo',
      login: 'admin',
      email: null,
      status: 'active',
      displayName: 'Администратор',
      ...(impersonatedBy ? { impersonatedBy } : {})
    },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles: ['tenant_admin'],
    permissions: []
  }) as unknown as UserSession;

describe('режим «от имени» распознаётся по сессии (ТЗ 13.5)', () => {
  it('обычная работа режимом не считается', () => {
    expect(isImpersonating(sessionOf())).toBe(false);
    expect(impersonationBanner(sessionOf(), 'УЦ «Мост»')).toBeNull();
    expect(impersonationConfirmNote(sessionOf())).toBeUndefined();
    expect(isImpersonating(null), 'без сессии режима нет').toBe(false);
  });

  it('признак приходит из сессии, а не из роли', () => {
    /*
     * Ключевая мысль: роль в этом режиме ровно та же, что у настоящего сотрудника центра
     * (`tenant_admin` в обоих случаях). Отличает их только метка из подписанного токена.
     */
    const normal = sessionOf();
    const impersonated = sessionOf('u_platform_admin');

    expect(normal.roles).toEqual(impersonated.roles);
    expect(isImpersonating(normal)).toBe(false);
    expect(isImpersonating(impersonated)).toBe(true);
  });
});

describe('полоса говорит, чьим именем идёт работа (ТЗ 13.5)', () => {
  it('названы центр и роль, и сказано про журнал', () => {
    const banner = impersonationBanner(sessionOf('u_platform_admin'), 'УЦ «Мост»');

    expect(banner?.text).toContain('УЦ «Мост»');
    expect(banner?.text, 'роль называется словарём Р1, а не кодом').toContain(
      'Администратор центра'
    );
    expect(banner?.text, 'человек должен знать про след в журнале').toContain('журнал');
    expect(banner?.exitLabel).toBe('Выйти из режима');
  });

  it('без названия центр зовётся словом, а не кодом', () => {
    /*
     * Первый заход подставлял сюда `tenantId` — и сторож оболочки поймал сырой идентификатор
     * в тексте для человека. Правило продукта не делает исключений даже для служебной полосы
     * (журнал 551).
     */
    const banner = impersonationBanner(sessionOf('u_platform_admin'));
    expect(banner).not.toBeNull();
    expect(banner?.text, 'кода центра в тексте быть не должно').not.toContain('tenant_demo');
    expect(banner?.text).toContain('учебного центра');
  });
});

describe('видимость обеспечена оболочкой, а не отдельным экраном (ТЗ 13.5)', () => {
  const shell = stripComments(
    readFileSync(fromApp('src', 'widgets', 'shell', 'app-shell.tsx'), 'utf8')
  );

  it('полоса живёт в оболочке — значит над любой страницей кабинета', () => {
    expect(shell).toContain('impersonationBanner(session');
    expect(shell, 'полоса рисуется разметкой оболочки').toContain('app-shell__impersonation');
    expect(shell, 'выход из режима — кнопкой рядом с текстом').toContain('impersonation.exitLabel');
  });

  it('пометка подтверждений кладётся один раз, а не в каждом вызове', () => {
    /*
     * Свойство пришлось бы передавать в десяток вызовов подтверждения, и первый же новый экран
     * забыл бы про него МОЛЧА: подтверждение выглядело бы обычным, а действие ушло бы от
     * чужого имени.
     */
    /*
     * Проверяется ПЕРЕДАЧА пометки, а не её упоминание. Первый замер искал имя постоянной в
     * файле — и подсаженная поломка «провайдер без пометки» прошла: имя нашлось в строке
     * ИМПОРТА. Та же грабля, что в журнале 494 (журнал 552).
     */
    expect(shell).toMatch(/<ImpersonationProvider[^>]*note:\s*IMPERSONATION_CONFIRM_NOTE/);
  });

  it('подтверждение показывает пометку, когда она задана', () => {
    const dialog = stripComments(
      readFileSync(fromPackages('ui', 'src', 'components', 'dialogs', 'use-confirm.tsx'), 'utf8')
    );
    expect(dialog).toContain('useImpersonationNote()');
    expect(dialog, 'пометка выводится, а не просто вычисляется').toContain('{impersonationNote}');
  });

  it('пометка называет последствие, а не сам факт режима', () => {
    expect(IMPERSONATION_CONFIRM_NOTE).toContain('журнал');
    expect(impersonationConfirmNote(sessionOf('u_platform_admin'))).toBe(
      IMPERSONATION_CONFIRM_NOTE
    );
  });
});

describe('сервер отдаёт признак режима (ТЗ 13.5)', () => {
  it('ручка «кто я» возвращает, кто вошёл от имени', () => {
    /*
     * Без этого экран о режиме не узнает вовсе: в сессии признак есть, а до интерфейса он не
     * доезжал — именно поэтому режим и был невидим.
     */
    const controller = stripComments(
      readFileSync(fromApp('..', 'backend', 'src', 'modules', 'iam', 'auth.controller.ts'), 'utf8')
    );
    /*
     * Проверяется, что признак попадает в ОТВЕТ, а не просто упоминается в теле обработчика.
     * Первый замер искал слово в куске файла — и подсаженная поломка «убрали признак из
     * ответа» прошла: слово осталось в соседнем условии (журнал 552).
     */
    const start = controller.indexOf("@Get('auth/me')");
    expect(start, 'ручка «кто я» должна существовать').toBeGreaterThan(-1);
    const body = controller.slice(start, start + 1600);
    expect(body, 'признак обязан попасть в ответ, а не только упоминаться').toMatch(
      /impersonatedBy:\s*context\.impersonatedBy/
    );
  });
});
