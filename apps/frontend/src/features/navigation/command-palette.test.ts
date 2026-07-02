import { describe, expect, it } from 'vitest';

import { type CommandItem, buildCommandItems, filterCommands } from './command-palette';

import type { UserSession } from '../../entities/session/model';

const items: CommandItem[] = [
  { href: '/courses', label: 'Курсы', group: 'Курсы и контент' },
  { href: '/audit', label: 'Аудит', group: 'Отчёты и выгрузки' },
  { href: '/groups', label: 'Группы', group: 'Люди и группы' }
];

describe('filterCommands', () => {
  it('пустой запрос → все пункты', () => {
    expect(filterCommands(items, '')).toEqual(items);
    expect(filterCommands(items, '   ')).toEqual(items);
  });

  it('матч по подстроке метки без учёта регистра', () => {
    expect(filterCommands(items, 'кур').map((i) => i.href)).toEqual(['/courses']);
    expect(filterCommands(items, 'ГРУП').map((i) => i.href)).toEqual(['/groups']);
  });

  it('матч по href', () => {
    expect(filterCommands(items, '/audit').map((i) => i.href)).toEqual(['/audit']);
  });

  it('матч по названию блока', () => {
    expect(filterCommands(items, 'отчёты').map((i) => i.href)).toEqual(['/audit']);
  });

  it('нет совпадений → пустой массив', () => {
    expect(filterCommands(items, 'zzz')).toEqual([]);
  });
});

describe('buildCommandItems', () => {
  const session = (permissions: string[]): UserSession => ({
    user: { id: 'u', tenantId: 't', login: 'l', email: null, status: 'active', displayName: 'U' },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles: [],
    permissions
  });

  it('источник — только доступные по правам страницы, с ярлыком блока', () => {
    const built = buildCommandItems(session(['courses.read']));
    const courses = built.find((i) => i.href === '/courses');
    expect(courses).toBeDefined();
    expect(courses?.group).toBe('Курсы и контент');
    expect(built.some((i) => i.href === '/audit')).toBe(false);
  });

  it('null-сессия → пусто', () => {
    expect(buildCommandItems(null)).toEqual([]);
  });
});
