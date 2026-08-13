import { describe, expect, it } from 'vitest';

import { SETTINGS_LINK_SECTIONS, visibleSettingsSections } from './sections';
import { navigationModel } from '../navigation/model';

import type { UserSession } from '../../entities/session/model';

const sessionWith = (permissions: string[]): UserSession => ({
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Админ'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions
});

const allPermissions = Array.from(
  new Set(navigationModel.flatMap((item) => item.requiredPermissions ?? []))
);

describe('оглавление настроек (IA-018)', () => {
  it('без сессии разделов нет', () => {
    expect(visibleSettingsSections(null)).toEqual([]);
  });

  it('каждый раздел-ссылка ведёт на существующий маршрут навигации', () => {
    // Ссылка в никуда — это не оглавление, а тупик. Ловим опечатку в адресе.
    const known = new Set(navigationModel.map((item) => item.href));
    const missing = SETTINGS_LINK_SECTIONS.filter(
      (section) => section.href && !known.has(section.href)
    ).map((section) => `${section.id} → ${section.href}`);
    expect(missing).toEqual([]);
  });

  it('раздел скрывается, если прав на его маршрут нет', () => {
    // Платформенные центры видит только platform_admin — администратору центра
    // показывать ссылку, ведущую на «нет доступа», нельзя.
    const visible = visibleSettingsSections(sessionWith(['tenant.read'])).map((s) => s.id);
    expect(visible).not.toContain('platform');
  });

  it('с полным набором прав видны все разделы', () => {
    const visible = visibleSettingsSections(sessionWith(allPermissions));
    expect(visible.length).toBe(SETTINGS_LINK_SECTIONS.length);
  });

  it('встроенные разделы (без своего маршрута) видны всегда', () => {
    // Их содержимое само решает, что показывать: например, оформление скрывается
    // без права на брендирование.
    const visible = visibleSettingsSections(sessionWith([])).map((s) => s.id);
    expect(visible).toContain('payments');
    expect(visible).toContain('notifications');
    expect(visible).toContain('webinars');
    expect(visible).toContain('profile');
  });

  it('якоря встроенных разделов уникальны — по ним приходят редиректы старых адресов', () => {
    const anchors = SETTINGS_LINK_SECTIONS.filter((s) => !s.href).map((s) => s.id);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toContain('payments');
    expect(anchors).toContain('notifications');
    expect(anchors).toContain('webinars');
  });

  it('у каждого раздела есть подсказка — что именно здесь настраивают', () => {
    // TPL-005: список названий без пояснений заставляет открывать разделы наугад.
    const withoutHint = SETTINGS_LINK_SECTIONS.filter((s) => !s.hint.trim()).map((s) => s.id);
    expect(withoutHint).toEqual([]);
  });
});
