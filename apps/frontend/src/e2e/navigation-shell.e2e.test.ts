import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getNavigationView, getVisibleNavigation } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';
import { roleBlueprints } from '../features/navigation/role-blueprints';

import type { UserSession } from '../entities/session/model';

/*
 * До Фазы 1 этот файл проверял ровно одно: что модуль оболочки импортируется.
 * Инвариантов у каркаса не было ни одного — при том что ТЗ §4.8 считало, будто
 * здесь охраняется структура сайдбара. Теперь охраняется.
 *
 * Пути — от файла, а не от process.cwd(): cwd различается между запуском из
 * корня и из apps/frontend (грабля из CLAUDE.md).
 */
const readShellSource = (name: string) =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), `../widgets/shell/${name}`),
    'utf8'
  );

/*
 * Журнал 344, 345 (§5.419). Администратору по правам виден и кабинет слушателя
 * (`/learner/**`), но меню собирается для адресата: сотруднику — разделы сотрудника.
 * Поэтому «всё видимое» для сотрудника — видимое минус кабинет слушателя; что вычтен
 * ровно он и ничего больше, проверяет отдельный тест ниже.
 */
const isLearnerCabinet = (href: string) => href === '/learner' || href.startsWith('/learner/');
const staffMenuOf = (session: UserSession) =>
  getVisibleNavigation(session).filter((item) => !isLearnerCabinet(item.href));

const shellSource = readShellSource('app-shell.tsx');
const paletteSource = readShellSource('command-palette.tsx');

/*
 * Администратор центра: в живой базе роли выданы ВСЕ права без исключения
 * (0010_iam_role_permissions_and_seed.sql:98-108 — join iam.permissions on true).
 * Поэтому сессия собирается из полного набора прав меню, а не из вручную
 * выписанного списка: иначе тест проверял бы выдуманную роль.
 */
const adminSession: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Админ'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: Array.from(
    new Set(navigationModel.flatMap((item) => item.requiredPermissions ?? []))
  )
};

describe('оболочка приложения', () => {
  it('AppShell импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/app-shell');
    expect(typeof mod.AppShell).toBe('function');
  });

  it('CommandPalette импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/command-palette');
    expect(typeof mod.CommandPalette).toBe('function');
  });

  it('GOAL-1: администратору видно не больше 7 пунктов сразу', () => {
    expect(getNavigationView(adminSession).main.length).toBeLessThanOrEqual(7);
  });

  it('GOAL-1: сокращение реально что-то сокращает — пунктов у роли заметно больше семи', () => {
    // Сторож самой метрики: если пунктов вдруг стало ≤7, проверка выше проходит
    // по построению и перестаёт что-либо доказывать.
    expect(getVisibleNavigation(adminSession).length).toBeGreaterThan(20);
  });

  /*
   * MET-002: метрика «пунктов меню, видимых роли» должна считаться тестом, а не глазами
   * в день замера. Считается на той же функции, что рисует меню, и для КАЖДОЙ роли из
   * чертежей — иначе новая роль въезжает с меню любой длины и никто не замечает.
   *
   * ⚠️ Права здесь взяты полным набором. Это верно ровно для одной роли — администратора
   * центра, которому в живой базе выданы все права (журнал 11). Для узких ролей набор
   * меньше, а значит и меню короче: проверка «не длиннее семи» на полном наборе — это
   * проверка худшего случая, и она строже, а не слабее. Настоящие наборы прав узких ролей
   * живут в миграциях `iam.role_permissions`, и мерить их надо на живой базе, а не
   * выдумывать здесь список.
   */
  it('MET-002: ни одной роли меню не показывает больше 7 пунктов сразу', () => {
    const tooLong = roleBlueprints
      .map((blueprint) => ({
        role: blueprint.role,
        count: getNavigationView({ ...adminSession, roles: [blueprint.role] }).main.length
      }))
      .filter((row) => row.count > 7)
      .map((row) => `${row.role}: ${row.count}`);

    expect(tooLong, 'меню роли длиннее бюджета §13.2').toEqual([]);
  });

  /*
   * Обратная сторона той же метрики: «Ещё» — законный склад, но если он растёт без счёта,
   * сокращение ИА оказывается пряткой. Число фиксируется, чтобы рост был виден на ревью.
   */
  it('MET-002: остаток в «Ещё» посчитан, а не оставлен без присмотра', () => {
    const view = getNavigationView(adminSession);
    expect(view.main.length + view.more.length).toBe(staffMenuOf(adminSession).length);
    expect(
      view.more.length,
      'в «Ещё» стало больше пунктов, чем было при замере. Это не запрет — это повод ' +
        'проверить, не прячется ли туда работа вместо того, чтобы попасть в блок ИА.'
    ).toBeLessThanOrEqual(60);
  });

  it('GOAL-5: ни один видимый пункт не потерян — main + more покрывают всё', () => {
    const view = getNavigationView(adminSession);
    const shown = [...view.main, ...view.more].map((item) => item.href).sort();
    expect(shown).toEqual(
      staffMenuOf(adminSession)
        .map((item) => item.href)
        .sort()
    );
  });

  it('GOAL-5: из меню сотрудника вычтен ровно кабинет слушателя — и ничего кроме', () => {
    const view = getNavigationView(adminSession);
    const shown = new Set([...view.main, ...view.more].map((item) => item.href));
    const dropped = getVisibleNavigation(adminSession)
      .map((item) => item.href)
      .filter((href) => !shown.has(href));
    expect(dropped.filter((href) => !isLearnerCabinet(href))).toEqual([]);
    // Кабинет по правам администратору виден целиком — и целиком не показан.
    expect(dropped.length).toBeGreaterThanOrEqual(8);
  });

  it('пункт не может оказаться одновременно в главном меню и в «Ещё»', () => {
    const view = getNavigationView(adminSession);
    const mainSet = new Set(view.main.map((item) => item.href));
    expect(view.more.filter((item) => mainSet.has(item.href))).toEqual([]);
  });

  it('IA-011: оболочка собирает меню через getNavigationView', () => {
    expect(shellSource).toContain('getNavigationView');
  });

  /*
   * UI-022. CSS каркаса уехал в packages/ui/src/styles/shell.ts, где его видят
   * сторожа токенов и тач-зон. Внутри <style jsx> они слепы — там и накопился
   * хардкод подложки и радиусов. Без этой проверки слой вернётся при первой же
   * правке «по-быстрому».
   */
  it('UI-022: в оболочке нет styled-jsx — CSS живёт в пакете под сторожами', () => {
    expect(shellSource).not.toContain('<style jsx>');
  });

  it('UI-022: в палитре команд нет styled-jsx', () => {
    expect(paletteSource).not.toContain('<style jsx>');
  });

  /*
   * UI-026: переключатель оформления доступен ИЗ ШАПКИ, а не только с экрана настроек.
   * Тема — это как громкость: её меняют по ходу работы. Человек, которому сейчас слишком
   * ярко, не должен вспоминать про существование настроек и идти туда.
   *
   * **Инвариант изменён осознанно (ТЗ 7.1, журнал 559).** Здесь требовалось, чтобы
   * `<ThemeSwitcher />` стоял в шапке ОТДЕЛЬНЫМ элементом. ТЗ стабилизации 7.1 прямо велит
   * убрать его из шапки в профиль: «занимает место на каждой странице». Два требования
   * конфликтуют только по месту, а не по сути — поэтому переключатель переехал В МЕНЮ
   * ЧЕЛОВЕКА: шапку он больше не занимает, но тема по-прежнему меняется на месте, без ухода
   * в настройки. Требование не снято, а уточнено.
   */
  it('UI-026: оформление меняется из шапки, не уходя в настройки', () => {
    expect(shellSource, 'переключатель обязан быть доступен из шапки').toContain(
      '<ThemeSwitcher />'
    );
    const menuStart = shellSource.indexOf('ui-header-menu__list');
    expect(menuStart, 'меню человека должно существовать').toBeGreaterThan(-1);
    expect(
      shellSource.slice(menuStart).includes('<ThemeSwitcher />'),
      'переключатель живёт в меню человека, а не отдельным элементом шапки'
    ).toBe(true);
  });

  /*
   * В шапке висел идентификатор арендатора с подписью «Тенант» — сырое машинное значение
   * на каждом экране, да ещё и дубль: название центра уже стоит слева.
   */
  it('в шапке нет идентификатора арендатора', () => {
    expect(shellSource).not.toContain('user.tenantId');
  });
});
