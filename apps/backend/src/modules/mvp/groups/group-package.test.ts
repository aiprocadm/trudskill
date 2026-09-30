import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { GroupDocumentPackageService } from './group-document-package.service.js';
import { GroupPackageController } from './group-package.controller.js';
import {
  type PackageEntry,
  issueRank,
  packageState,
  planPackageIssue,
  scopeOf,
  uniqueEntries
} from './group-package.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { InMemoryDocumentsState } from '../../documents/in-memory-documents.state.js';
import { REQUIRED_PERMISSIONS } from '../../iam/permission.decorator.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { IssueReadinessReport } from './issue-readiness.js';
import type { RequestContext } from '../../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_curator'
} as RequestContext;

const order: PackageEntry = {
  kindCode: 'order.enrollment',
  templateId: 'tpl_order',
  templateType: 'order',
  templateName: 'Приказ',
  isRequired: true
};
const protocol: PackageEntry = {
  kindCode: 'protocol.knowledge_check',
  templateId: 'tpl_protocol',
  templateType: 'protocol',
  templateName: 'Протокол',
  isRequired: true
};
const certificate: PackageEntry = {
  kindCode: 'certificate.ot',
  templateId: 'tpl_cert',
  templateType: 'certificate',
  templateName: 'Удостоверение',
  isRequired: true
};

describe('пакет документов группы: правила (МГ-F2.1, срез 21.1)', () => {
  it('порядок CDOPROF: приказы → протокол → документы слушателей; повторы видов сливаются', () => {
    expect(scopeOf(order)).toBe('group');
    expect(scopeOf(certificate)).toBe('learner');
    expect(scopeOf({ templateType: 'diploma' })).toBe('learner');
    expect(issueRank(order)).toBeLessThan(issueRank(protocol));
    expect(issueRank(protocol)).toBeLessThan(issueRank(certificate));
    const unique = uniqueEntries([
      certificate,
      protocol,
      { ...order, isRequired: false },
      { ...order, isRequired: true }
    ]);
    expect(unique.map((e) => e.kindCode)).toEqual([
      'order.enrollment',
      'protocol.knowledge_check',
      'certificate.ot'
    ]);
    expect(unique[0]?.isRequired).toBe(true);
  });

  it('план: групповой документ — один раз, документ слушателя — каждому готовому; выбор видов', () => {
    const plan = planPackageIssue({
      groupId: 'g1',
      entries: [certificate, protocol, order],
      eligibleEnrollmentIds: ['e1', 'e2']
    });
    expect(plan.map((p) => `${p.entry.kindCode}:${p.sourceEntityId}`)).toEqual([
      'order.enrollment:g1',
      'protocol.knowledge_check:g1',
      'certificate.ot:e1',
      'certificate.ot:e2'
    ]);
    expect(
      planPackageIssue({
        groupId: 'g1',
        entries: [certificate, protocol, order],
        kindCodes: ['certificate.ot'],
        eligibleEnrollmentIds: ['e1']
      }).map((p) => p.sourceEntityId)
    ).toEqual(['e1']);
  });

  it('«вид × состояние»: выпущено, частично, в работе, упало, не начато', () => {
    const rows = packageState({
      groupId: 'g1',
      entries: [order, protocol, certificate],
      enrollmentIds: ['e1', 'e2'],
      documents: [
        {
          id: 'd1',
          templateId: 'tpl_order',
          kindCode: 'order.enrollment',
          sourceEntityType: 'group',
          sourceEntityId: 'g1'
        },
        {
          id: 'd2',
          templateId: 'tpl_cert',
          kindCode: 'certificate.ot',
          sourceEntityType: 'enrollment',
          sourceEntityId: 'e1'
        },
        {
          id: 'dx',
          templateId: 'tpl_cert',
          kindCode: 'certificate.ot',
          sourceEntityType: 'enrollment',
          sourceEntityId: 'e_other'
        }
      ],
      tasks: [
        {
          templateId: 'tpl_protocol',
          kindCode: 'protocol.knowledge_check',
          sourceEntityType: 'group',
          sourceEntityId: 'g1',
          status: 'failed'
        },
        {
          templateId: 'tpl_cert',
          kindCode: 'certificate.ot',
          sourceEntityType: 'enrollment',
          sourceEntityId: 'e2',
          status: 'queued'
        }
      ],
      kindName: (code) => (code === 'order.enrollment' ? 'Приказ о зачислении' : undefined)
    });
    expect(rows.map((r) => [r.key, r.state, r.issued, r.expected])).toEqual([
      ['order.enrollment', 'issued', 1, 1],
      ['protocol.knowledge_check', 'failed', 0, 1],
      ['certificate.ot', 'in_progress', 1, 2]
    ]);
    expect(rows[0]?.title).toBe('Приказ о зачислении');
    expect(rows[2]?.documentIds).toEqual(['d2']);
  });
});

describe('пакет документов группы: выпуск (МГ-F2.1, срез 21.1)', () => {
  const make = () => {
    const docState = new InMemoryDocumentsState();
    const documents = new DocumentsService(
      docState,
      new AuditService(),
      new RealtimeEventsService()
    );
    const templateOf = (name: string, templateType: string) => {
      const template = documents.createTemplate(T, 'u_admin', { name, templateType } as never, ctx);
      const version = documents.createTemplateVersion(T, 'u_admin', {
        templateId: template.id,
        fileId: `file_${name}`
      });
      documents.activateTemplateVersion(T, 'u_admin', version.id, ctx);
      return template;
    };
    const tOrder = templateOf('Приказ о зачислении', 'order');
    const tProtocol = templateOf('Протокол', 'protocol');
    const tCert = templateOf('Удостоверение', 'certificate');

    const state = new InMemoryMvpState();
    const mvp = new MvpService(
      state,
      new TenantScopedRepository(),
      { write: vi.fn() } as never,
      documents,
      {} as never,
      { emit: vi.fn() } as never
    );
    const course = mvp.createCourse(T, 'u_admin', { code: 'ОТ-1', title: 'Охрана труда' }, ctx);
    const version = mvp.createCourseVersion(T, course.id, 'u_admin', ctx);
    mvp.setCourseDocumentSet(
      T,
      'u_admin',
      version.id,
      {
        entries: [
          {
            templateId: tCert.id,
            position: 0,
            isRequired: true,
            autoIssueOnCompletion: false,
            kindCode: 'certificate.ot'
          },
          {
            templateId: tProtocol.id,
            position: 1,
            isRequired: true,
            autoIssueOnCompletion: false,
            kindCode: 'protocol.knowledge_check'
          },
          {
            templateId: tOrder.id,
            position: 2,
            isRequired: true,
            autoIssueOnCompletion: false,
            kindCode: 'order.enrollment'
          }
        ]
      },
      ctx
    );
    state.groups.push({
      id: 'g1',
      tenantId: T,
      code: '264501',
      name: 'Группа',
      status: 'exam'
    } as never);
    state.groupCourses.push({
      id: 'gc1',
      tenantId: T,
      groupId: 'g1',
      courseId: course.id,
      courseVersionId: version.id
    } as never);
    state.enrollments.push(
      {
        id: 'e1',
        tenantId: T,
        groupId: 'g1',
        learnerId: 'l1',
        status: 'completed',
        resultCode: 'passed'
      } as never,
      {
        id: 'e2',
        tenantId: T,
        groupId: 'g1',
        learnerId: 'l2',
        status: 'completed',
        resultCode: 'passed'
      } as never
    );
    const service = new GroupDocumentPackageService(state, mvp, documents);
    return {
      service,
      state,
      documents,
      docState,
      ids: { order: tOrder.id, protocol: tProtocol.id, cert: tCert.id }
    };
  };

  const report = (blocked: string[] = []): IssueReadinessReport => ({
    ready: blocked.length === 0,
    center: [],
    group: [],
    learners: blocked.map((learnerId) => ({
      learnerId,
      learnerName: 'Петров Пётр',
      issues: [{ code: 'learner_snils_missing', message: 'Не заполнен СНИЛС' }]
    })),
    totals: { learners: 2, learnersReady: 2 - blocked.length },
    consentRequired: false
  });

  it('выпуск: приказ → протокол → удостоверения готовым; неготовый — поимённо; группа → «документы»', () => {
    const { service, state, documents } = make();
    const { outcome, tasks } = service.issue(
      T,
      'u_curator',
      'g1',
      { protocolDate: '2026-12-18', orderDate: '2026-12-01' },
      report(['l2']),
      ctx
    );
    expect(tasks.map((t) => `${t.kindCode}:${t.sourceEntityId}`)).toEqual([
      'order.enrollment:g1',
      'protocol.knowledge_check:g1',
      'certificate.ot:e1'
    ]);
    expect(tasks.map((t) => t.documentDate)).toEqual(['2026-12-01', '2026-12-18', '2026-12-18']);
    expect(outcome).toMatchObject({ tasks: 3, created: 3, retried: 0, learnersIncluded: 1 });
    expect(outcome.skipped).toEqual([
      { enrollmentId: 'e2', learnerName: 'Петров Пётр', reasons: ['Не заполнен СНИЛС'] }
    ]);
    expect(state.groups[0]).toMatchObject({ status: 'documents' });

    // Повтор не плодит дублей: те же задачи, ничего нового.
    const again = service.issue(T, 'u_curator', 'g1', {}, report(['l2']), ctx);
    expect(again.outcome.created).toBe(0);
    expect(again.tasks.map((t) => t.id)).toEqual(tasks.map((t) => t.id));

    const view = service.view(T, 'g1');
    expect(view.kinds.map((k) => [k.key, k.state])).toEqual([
      ['order.enrollment', 'in_progress'],
      ['protocol.knowledge_check', 'in_progress'],
      ['certificate.ot', 'in_progress']
    ]);
    expect(documents.groupPackageFacts(T, 'g1', ['e1', 'e2']).tasks).toHaveLength(3);
  });

  it('срез 21.3: «пакет выдан» — когда выпущены все обязательные виды; статус группы в ответе', () => {
    const { service, docState, ids } = make();
    const first = service.view(T, 'g1');
    expect(first).toMatchObject({ groupStatus: 'exam', complete: false });
    const doc = (id: string, templateId: string, kindCode: string, type: string, source: string) =>
      ({
        id,
        tenantId: T,
        templateId,
        kindCode,
        sourceEntityType: type,
        sourceEntityId: source,
        status: 'final'
      }) as never;
    docState.generatedDocuments.push(
      doc('d1', ids.order, 'order.enrollment', 'group', 'g1'),
      doc('d2', ids.protocol, 'protocol.knowledge_check', 'group', 'g1'),
      doc('d3', ids.cert, 'certificate.ot', 'enrollment', 'e1')
    );
    expect(service.view(T, 'g1').complete).toBe(false);
    docState.generatedDocuments.push(doc('d4', ids.cert, 'certificate.ot', 'enrollment', 'e2'));
    expect(service.view(T, 'g1').complete).toBe(true);
  });

  it('ручки: смотреть — documents.read, выпускать — documents.generate', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, GroupPackageController.prototype.view)
    ).toEqual(['documents.read']);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, GroupPackageController.prototype.issue)
    ).toEqual(['documents.generate']);
  });
});
