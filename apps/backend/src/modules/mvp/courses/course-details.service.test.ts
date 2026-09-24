import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { UpdateCourseRequest } from '../mvp.dto.js';
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
  const audit = { write: vi.fn() };
  const mvp = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    audit as never,
    { listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }) } as never,
    {} as never,
    { emit: vi.fn() } as never
  );
  return { mvp, audit };
}

describe('поля курса CDOPROF (МГ-E2.1, срез 16.1)', () => {
  it('создание и правка: поля сохраняются, null очищает только своё, части номера без пустых', () => {
    const { mvp } = makeService();
    const course = mvp.createCourse(
      T,
      ctx.userId,
      {
        code: 'R13.Б',
        title: 'ОТ Б',
        presentationTitle: ' Обучение по охране труда по программе Б ',
        sortNo: 3,
        price: 2500.5,
        periodDaysDefault: 36,
        frdoDocumentKind: 'PK',
        certificateNumberParts: ['14', ' ', 'ОТ'],
        docExtraFields: [
          { key: 'qualification', label: 'Присвоена квалификация', value: ' Электромонтёр ' }
        ]
      },
      ctx
    );
    expect(course).toMatchObject({
      presentationTitle: 'Обучение по охране труда по программе Б',
      sortNo: 3,
      price: 2500.5,
      periodDaysDefault: 36,
      frdoDocumentKind: 'PK',
      certificateNumberParts: ['14', 'ОТ'],
      docExtraFields: [
        { key: 'qualification', label: 'Присвоена квалификация', value: 'Электромонтёр' }
      ]
    });
    const updated = mvp.updateCourse(
      T,
      ctx.userId,
      course.id,
      { price: null, note: 'для заявок' },
      ctx
    );
    expect(updated.price).toBeUndefined();
    expect(updated.note).toBe('для заявок');
    expect(updated.periodDaysDefault).toBe(36);
  });

  it('вид ФРДО вне справочника и повтор ключа доп. поля — понятный отказ', () => {
    const { mvp } = makeService();
    expect(() =>
      mvp.createCourse(T, ctx.userId, { code: 'A', title: 'A', frdoDocumentKind: 'XX' }, ctx)
    ).toThrow(/нет в справочнике ФИС ФРДО/);
    expect(() =>
      mvp.createCourse(
        T,
        ctx.userId,
        {
          code: 'B',
          title: 'B',
          docExtraFields: [
            { key: 'rank', label: 'Разряд', value: '3' },
            { key: 'rank', label: 'Разряд 2', value: '4' }
          ]
        },
        ctx
      )
    ).toThrow(/указано дважды/);
    expect(mvp.listFrdoDocumentKinds().map((k) => k.code)).toEqual(['PK', 'PP']);
  });

  it('срок курса группы по умолчанию — из курса; новая версия курса — в журнал', () => {
    const { mvp, audit } = makeService();
    const course = mvp.createCourse(
      T,
      ctx.userId,
      { code: 'C', title: 'C', periodDaysDefault: 36 },
      ctx
    );
    const group = mvp.createGroup(T, ctx.userId, { name: 'Группа' }, ctx);
    const gc = mvp.createGroupCourse(T, { groupId: group.id, courseId: course.id });
    expect(gc.durationDays).toBe(36);
    const version = mvp.createCourseVersion(T, course.id, ctx.userId, ctx);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.course_version_created', entityId: version.id })
    );
  });

  it('тело запроса: цена — не больше двух знаков после запятой, ключ поля — латиница с буквы', () => {
    const errors = (raw: unknown) =>
      validateSync(plainToInstance(UpdateCourseRequest, raw), {
        whitelist: true,
        forbidNonWhitelisted: true
      }).map((e) => e.property);
    expect(errors({ price: 10.555 })).toEqual(['price']);
    expect(errors({ docExtraFields: [{ key: 'Разряд', label: 'Разряд', value: '3' }] })).toEqual([
      'docExtraFields'
    ]);
    expect(errors({ certificateNumberParts: ['1', '2', '3', '4'] })).toEqual([
      'certificateNumberParts'
    ]);
    expect(errors({ presentationTitle: null, price: 1990.9, directionId: null })).toEqual([]);
  });
});
