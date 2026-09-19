import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

/**
 * Перестановка модулей и материалов программы (ТЗ 8.4).
 *
 * Проверяется не только «порядок поменялся», но и то, ради чего решение принято:
 * повторный запрос ничего не ломает, чужой пункт и неполный список отклоняются с
 * человеческим объяснением, а перестановка в одном центре не задевает другой.
 */

const noopDocuments = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;
const noopFiles = { ensureMaterialLink: async () => undefined } as unknown as FilesService;

const ctx = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_methodist',
  ip: '127.0.0.1',
  userAgent: 'vitest'
} as RequestContext;

/** Состояние возвращается наружу: изоляция проверяется подложенной чужой записью. */
const makeService = () => {
  const state = new InMemoryMvpState();
  return {
    state,
    service: new MvpService(
      state,
      new TenantScopedRepository(),
      new AuditService(),
      noopDocuments,
      noopFiles,
      new EventEmitter2()
    )
  };
};

/** Курс с версией и тремя модулями — общая заготовка. */
const withProgram = (tenantId = 'tenant_demo') => {
  const { state, service } = makeService();
  const course = service.createCourse(tenantId, ctx.userId, { code: 'C1', title: 'Курс' }, ctx);
  const version = service.createCourseVersion(tenantId, course.id);
  const modules = ['Первый', 'Второй', 'Третий'].map((title) =>
    service.createModule(
      tenantId,
      ctx.userId,
      { courseVersionId: version.id, title, minViewSeconds: 0, isRequired: true },
      ctx
    )
  );
  return { service, state, versionId: version.id, modules };
};

describe('перестановка модулей (ТЗ 8.4)', () => {
  it('новый порядок раскладывается с нуля', () => {
    const { service, versionId, modules } = withProgram();
    const [a, b, c] = modules;

    const result = service.reorderModules(
      'tenant_demo',
      ctx.userId,
      versionId,
      [c!.id, a!.id, b!.id],
      ctx
    );

    expect(result.map((item) => [item.id, item.sortOrder])).toEqual([
      [c!.id, 0],
      [a!.id, 1],
      [b!.id, 2]
    ]);
  });

  it('повторный запрос ничего не ломает', () => {
    /* Ради этого порядок и передаётся целиком: обрыв связи и повтор — обычное дело. */
    const { service, versionId, modules } = withProgram();
    const order = [modules[1]!.id, modules[0]!.id, modules[2]!.id];

    service.reorderModules('tenant_demo', ctx.userId, versionId, order, ctx);
    const second = service.reorderModules('tenant_demo', ctx.userId, versionId, order, ctx);

    expect(second.map((item) => item.id)).toEqual(order);
    expect(second.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
  });

  it('неполный список отклоняется человеческим отказом', () => {
    const { service, versionId, modules } = withProgram();

    expect(() =>
      service.reorderModules('tenant_demo', ctx.userId, versionId, [modules[0]!.id], ctx)
    ).toThrow(BadRequestException);

    try {
      service.reorderModules('tenant_demo', ctx.userId, versionId, [modules[0]!.id], ctx);
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as { message: string };
      expect(body.message, 'отказ называет числа, а не код').toContain('пунктов 3');
    }
  });

  it('чужой пункт в списке отклоняется', () => {
    const { service, versionId, modules } = withProgram();
    expect(() =>
      service.reorderModules(
        'tenant_demo',
        ctx.userId,
        versionId,
        [modules[0]!.id, modules[1]!.id, 'чужой'],
        ctx
      )
    ).toThrow(/не из этой программы/);
  });

  it('несуществующая версия — «не найдено», а не «неверный список»', () => {
    /* Иначе человек не понял бы, по какому адресу он вообще стучится. */
    const { service } = withProgram();
    expect(() => service.reorderModules('tenant_demo', ctx.userId, 'нет такой', [], ctx)).toThrow(
      NotFoundException
    );
  });

  it('перестановка в одном центре не видит чужие модули', () => {
    /*
     * Проверка НАМЕРЕННО злая: чужой модуль подкладывается с ТЕМ ЖЕ `courseVersionId`. В жизни
     * такое совпадение идентификаторов маловероятно, но именно так утечки между центрами и
     * происходят — на общем пространстве ключей. Слабая проверка (чужой модуль в чужой версии)
     * ничего не доказывала бы: фильтр по центру в ней не нёс нагрузки, и его снятие оставалось
     * бы незамеченным (журнал 541).
     */
    const { service, state, versionId, modules } = withProgram();
    const foreignOrder = modules[0]!.sortOrder;
    state.modules.push({
      ...modules[0]!,
      id: 'mod_foreign',
      tenantId: 'tenant_other',
      title: 'Чужой'
    });

    const result = service.reorderModules(
      'tenant_demo',
      ctx.userId,
      versionId,
      [modules[2]!.id, modules[1]!.id, modules[0]!.id],
      ctx
    );

    expect(result, 'три своих модуля, чужого среди них нет').toHaveLength(3);
    expect(
      state.modules.find((row) => row.id === 'mod_foreign')?.sortOrder,
      'чужой модуль остался на своём месте'
    ).toBe(foreignOrder);
  });
});

describe('перестановка материалов (ТЗ 8.4)', () => {
  it('материалы внутри модуля меняют порядок', () => {
    const { service, modules } = withProgram();
    const moduleId = modules[0]!.id;
    const materials = ['А', 'Б', 'В'].map((title) =>
      service.createMaterial(
        'tenant_demo',
        ctx.userId,
        { moduleId, title, materialType: 'text', minViewSeconds: 60, isRequired: true },
        ctx
      )
    );

    const result = service.reorderMaterials(
      'tenant_demo',
      ctx.userId,
      moduleId,
      [materials[2]!.id, materials[0]!.id, materials[1]!.id],
      ctx
    );

    expect(result.map((item) => item.title)).toEqual(['В', 'А', 'Б']);
    expect(result.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
  });

  it('материалы соседнего модуля в перестановку не попадают', () => {
    const { service, modules } = withProgram();
    const first = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      {
        moduleId: modules[0]!.id,
        title: 'Свой',
        materialType: 'text',
        minViewSeconds: 60,
        isRequired: true
      },
      ctx
    );
    service.createMaterial(
      'tenant_demo',
      ctx.userId,
      {
        moduleId: modules[1]!.id,
        title: 'Соседний',
        materialType: 'text',
        minViewSeconds: 60,
        isRequired: true
      },
      ctx
    );

    const result = service.reorderMaterials(
      'tenant_demo',
      ctx.userId,
      modules[0]!.id,
      [first.id],
      ctx
    );
    expect(result.map((item) => item.title)).toEqual(['Свой']);
  });
});
