import { describe, expect, it, vi } from 'vitest';

import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_methodist'
} as RequestContext;

function makeService() {
  const mvp = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    { write: vi.fn() } as never,
    { listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }) } as never,
    {} as never,
    { emit: vi.fn() } as never
  );
  return mvp;
}

describe('направления и направление курса (МГ-E1.1, срез 15.1)', () => {
  it('направление: код уникален, вложенность без петель, в архивное не вкладывается', () => {
    const mvp = makeService();
    const ot = mvp.createDirection(T, ctx.userId, { code: 'R13', name: 'Охрана труда' }, ctx);
    const module = mvp.createDirection(
      T,
      ctx.userId,
      { code: 'R13.Б', name: 'Модуль Б', parentDirectionId: ot.id, sortOrder: 2, note: ' СИЗ ' },
      ctx
    );
    expect(module).toMatchObject({
      parentDirectionId: ot.id,
      sortOrder: 2,
      note: 'СИЗ',
      status: 'active'
    });

    expect(() => mvp.createDirection(T, ctx.userId, { code: 'R13', name: 'Дубль' }, ctx)).toThrow(
      /уже используется у другого направления/
    );
    expect(() =>
      mvp.updateDirection(T, ctx.userId, ot.id, { parentDirectionId: module.id }, ctx)
    ).toThrow(/нельзя вложить в само себя или в своё вложенное/);
    expect(() =>
      mvp.updateDirection(T, ctx.userId, ot.id, { parentDirectionId: ot.id }, ctx)
    ).toThrow(/нельзя вложить/);

    const archived = mvp.createDirection(T, ctx.userId, { code: 'OLD', name: 'Старое' }, ctx);
    mvp.updateDirection(T, ctx.userId, archived.id, { status: 'archived' }, ctx);
    expect(() =>
      mvp.createDirection(
        T,
        ctx.userId,
        { code: 'NEW', name: 'Новое', parentDirectionId: archived.id },
        ctx
      )
    ).toThrow(/в архиве — вложить в него нельзя/);
  });

  it('архив: сначала вложенные; снятие родителя и примечания — null', () => {
    const mvp = makeService();
    const root = mvp.createDirection(T, ctx.userId, { code: 'R3', name: 'Высота' }, ctx);
    const child = mvp.createDirection(
      T,
      ctx.userId,
      { code: 'R3.1', name: 'Группа 1', parentDirectionId: root.id, note: 'заметка' },
      ctx
    );
    expect(() => mvp.updateDirection(T, ctx.userId, root.id, { status: 'archived' }, ctx)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'direction_has_active_children' })
      })
    );
    mvp.updateDirection(T, ctx.userId, child.id, { parentDirectionId: null, note: null }, ctx);
    const moved = mvp.getDirection(T, child.id);
    expect(moved.parentDirectionId).toBeUndefined();
    expect(moved.note).toBeUndefined();
    expect(mvp.updateDirection(T, ctx.userId, root.id, { status: 'archived' }, ctx).status).toBe(
      'archived'
    );
  });

  it('курс: направление принимается (раньше — 400), фильтр списка по направлению, архивное — отказ', () => {
    const mvp = makeService();
    const ot = mvp.createDirection(T, ctx.userId, { code: 'R13', name: 'Охрана труда' }, ctx);
    const fire = mvp.createDirection(T, ctx.userId, { code: 'R15', name: 'Пожарная' }, ctx);
    const a = mvp.createCourse(
      T,
      ctx.userId,
      { code: 'R13.А', title: 'ОТ А', directionId: ot.id },
      ctx
    );
    mvp.createCourse(T, ctx.userId, { code: 'R15.1', title: 'ПБ', directionId: fire.id }, ctx);
    mvp.createCourse(T, ctx.userId, { code: 'X', title: 'Без направления' }, ctx);
    expect(a.directionId).toBe(ot.id);
    expect(mvp.listCourses(T, { direction_id: ot.id }).items.map((c) => c.code)).toEqual(['R13.А']);

    mvp.updateCourse(T, ctx.userId, a.id, { directionId: fire.id }, ctx);
    expect(mvp.listCourses(T, { direction_id: fire.id }).total).toBe(2);
    mvp.updateCourse(T, ctx.userId, a.id, { directionId: null }, ctx);
    expect(mvp.getCourse(T, a.id).directionId).toBeUndefined();

    mvp.updateDirection(T, ctx.userId, fire.id, { status: 'archived' }, ctx);
    expect(() =>
      mvp.createCourse(T, ctx.userId, { code: 'R15.2', title: 'ПБ 2', directionId: fire.id }, ctx)
    ).toThrow(/в архиве — выберите действующее/);
    expect(() =>
      mvp.createCourse(
        T,
        ctx.userId,
        { code: 'Y', title: 'Чужое', directionId: 'direction_ghost' },
        ctx
      )
    ).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('код курса уникален в центре — повтор даёт понятный отказ, а не второй курс', () => {
    const mvp = makeService();
    const first = mvp.createCourse(T, ctx.userId, { code: 'R13.Б', title: 'Модуль Б' }, ctx);
    expect(() => mvp.createCourse(T, ctx.userId, { code: 'R13.Б', title: 'Дубль' }, ctx)).toThrow(
      /Код «R13\.Б» уже используется у другого курса/
    );
    const second = mvp.createCourse(T, ctx.userId, { code: 'R13.В', title: 'Модуль В' }, ctx);
    expect(() => mvp.updateCourse(T, ctx.userId, second.id, { code: 'R13.Б' }, ctx)).toThrow(
      /уже используется у другого курса/
    );
    expect(
      mvp.updateCourse(T, ctx.userId, first.id, { code: 'R13.Б', title: 'Модуль Б (2026)' }, ctx)
        .title
    ).toBe('Модуль Б (2026)');
  });
});
