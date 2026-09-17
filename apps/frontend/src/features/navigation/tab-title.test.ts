import { describe, expect, it } from 'vitest';

import { buildBreadcrumbs } from './breadcrumbs';
import { tabTitle } from './tab-title';

/** Заголовок вкладки — из тех же крошек, что и путь над страницей (ТЗ 4.3 / Я3). */
describe('tabTitle', () => {
  it('раздел из реестра и имя центра', () => {
    expect(tabTitle(buildBreadcrumbs('/groups'), 'Центр охраны труда')).toBe(
      'Группы — Центр охраны труда'
    );
  });

  it('блок ИА во вкладку не идёт — только раздел', () => {
    expect(tabTitle(buildBreadcrumbs('/admin/tests'), 'trudskill')).toBe('Тесты — trudskill');
  });

  it('карточка: имя объекта, затем раздел', () => {
    const crumbs = buildBreadcrumbs('/groups/group_9z34wx1b', {
      status: 'ready',
      name: 'Группа 360px'
    });
    expect(tabTitle(crumbs, 'trudskill')).toBe('Группа 360px — Группы — trudskill');
  });

  it('пока имя объекта едет — вкладка называет раздел, без пустот и скелетонов', () => {
    expect(tabTitle(buildBreadcrumbs('/groups/group_9z34wx1b'), 'trudskill')).toBe(
      'Группы — trudskill'
    );
  });

  it('кабинет слушателя: последний раздел, без «Мой кабинет» впереди', () => {
    expect(tabTitle(buildBreadcrumbs('/learner/documents'), 'trudskill')).toBe(
      'Мои документы — trudskill'
    );
  });

  it('диспетчер входа — только имя центра', () => {
    expect(tabTitle(buildBreadcrumbs('/'), 'trudskill')).toBe('trudskill');
  });
});
