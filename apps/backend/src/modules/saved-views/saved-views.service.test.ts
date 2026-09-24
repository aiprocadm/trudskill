import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { InMemorySavedViewsRepository } from './in-memory-saved-views.repository.js';
import { SAVED_VIEWS_PER_USER_MAX, SavedViewsService } from './saved-views.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = (userId: string): RequestContext => ({
  requestId: 'r0',
  correlationId: 'c0',
  tenantId: T,
  userId,
  ip: '127.0.0.1',
  userAgent: 'vitest'
});

const make = () => {
  const audit = new AuditService();
  return { service: new SavedViewsService(new InMemorySavedViewsRepository(), audit), audit };
};

/** Сохранённые представления на сервере (МГ-H4.1, срез 11.3, РМ106–РМ108). */
describe('SavedViewsService', () => {
  it('своё видит только владелец, общее — весь центр; чужой центр не видит ничего', async () => {
    const { service, audit } = make();
    const own = await service.create(
      T,
      'u1',
      {
        entity: 'learners',
        name: ' Мои должники ',
        filters: { status: 'active', q: '', noEmail: '1' }
      },
      'private',
      ctx('u1')
    );
    await service.create(
      T,
      'admin',
      { entity: 'learners', name: 'Общее', filters: {} },
      'tenant',
      ctx('admin')
    );
    expect(own).toMatchObject({
      name: 'Мои должники',
      scope: 'private',
      own: true,
      filters: { status: 'active', noEmail: '1' }
    });
    expect((await service.list(T, 'learners', 'u1')).map((v) => [v.name, v.own])).toEqual([
      ['Общее', false],
      ['Мои должники', true]
    ]);
    expect((await service.list(T, 'learners', 'u2')).map((v) => v.name)).toEqual(['Общее']);
    expect(await service.list('tenant_other', 'learners', 'u1')).toEqual([]);
    const record = (await audit.listPage(T, { action: 'reports.saved_view_created' })).items[0];
    expect(record?.newValues).toMatchObject({ entity: 'learners', scope: 'private' });
  });

  it('пустое имя, чужой реестр и предел на человека — понятные отказы', async () => {
    const { service } = make();
    await expect(
      service.create(T, 'u1', { entity: 'learners', name: '  ', filters: {} }, 'private', ctx('u1'))
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(T, 'u1', { entity: 'invoices', name: 'x', filters: {} }, 'private', ctx('u1'))
    ).rejects.toBeInstanceOf(BadRequestException);
    for (let i = 0; i < SAVED_VIEWS_PER_USER_MAX; i += 1) {
      await service.create(
        T,
        'u1',
        { entity: 'groups', name: `v${i}`, filters: {} },
        'private',
        ctx('u1')
      );
    }
    await expect(
      service.create(T, 'u1', { entity: 'groups', name: 'ещё', filters: {} }, 'private', ctx('u1'))
    ).rejects.toMatchObject({ response: { code: 'saved_views_limit_reached' } });
  });

  it('удалить своё может владелец; чужое своё — нельзя; общее — только с правом настроек', async () => {
    const { service } = make();
    const own = await service.create(
      T,
      'u1',
      { entity: 'learners', name: 'Моё', filters: {} },
      'private',
      ctx('u1')
    );
    const shared = await service.create(
      T,
      'admin',
      { entity: 'learners', name: 'Общее', filters: {} },
      'tenant',
      ctx('admin')
    );
    await expect(service.remove(T, 'u2', own.id, false, ctx('u2'))).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(service.remove(T, 'u2', shared.id, false, ctx('u2'))).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await service.remove(T, 'u2', shared.id, true, ctx('u2'));
    await service.remove(T, 'u1', own.id, false, ctx('u1'));
    expect(await service.list(T, 'learners', 'u1')).toEqual([]);
    await expect(service.remove(T, 'u1', own.id, false, ctx('u1'))).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
