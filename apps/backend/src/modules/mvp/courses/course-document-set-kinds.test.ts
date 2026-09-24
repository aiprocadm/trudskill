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

const templates: Record<string, { templateType: string; name: string }> = {
  tpl_cert: { templateType: 'certificate', name: 'Удостоверение' },
  tpl_order: { templateType: 'order', name: 'Приказ' }
};

function makeService() {
  const documents = {
    listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }),
    getTemplate: (_tenant: string, id: string) => {
      const found = templates[id];
      if (!found) throw new Error('not found');
      return found;
    }
  };
  return new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    { write: vi.fn() } as never,
    documents as never,
    {} as never,
    { emit: vi.fn() } as never
  );
}

describe('набор документов курса по видам (МГ-F1.1, срез 18.1)', () => {
  it('строка набора помнит вид; вид на чужом типе шаблона — отказ всего набора', () => {
    const mvp = makeService();
    const course = mvp.createCourse(T, ctx.userId, { code: 'R13.Б', title: 'ОТ Б' }, ctx);
    const version = mvp.createCourseVersion(T, course.id, ctx.userId, ctx);
    const saved = mvp.setCourseDocumentSet(
      T,
      ctx.userId,
      version.id,
      {
        entries: [
          {
            templateId: 'tpl_order',
            position: 0,
            isRequired: true,
            autoIssueOnCompletion: false,
            kindCode: 'order.enrollment'
          },
          {
            templateId: 'tpl_cert',
            position: 1,
            isRequired: true,
            autoIssueOnCompletion: true,
            kindCode: 'certificate.ot'
          }
        ]
      },
      ctx
    );
    expect(saved.map((e) => e.kindCode)).toEqual(['order.enrollment', 'certificate.ot']);

    expect(() =>
      mvp.setCourseDocumentSet(
        T,
        ctx.userId,
        version.id,
        {
          entries: [
            {
              templateId: 'tpl_order',
              position: 0,
              isRequired: true,
              autoIssueOnCompletion: true,
              kindCode: 'certificate.ot'
            }
          ]
        },
        ctx
      )
    ).toThrow(/не подходит для вида «Удостоверение»/);
    expect(mvp.getCourseDocumentSet(T, version.id)).toHaveLength(2);
  });
});
