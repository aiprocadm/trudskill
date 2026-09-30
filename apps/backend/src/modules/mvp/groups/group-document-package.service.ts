import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  type PackageEntry,
  type PackageKindRow,
  packageState,
  planPackageIssue
} from './group-package.js';
import { documentKindOf } from '../../documents/document-kinds.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { IssueReadinessReport } from './issue-readiness.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { DocumentGenerationTaskEntity } from '../../documents/documents.types.js';

export interface GroupPackageView {
  groupId: string;
  learners: number;
  kinds: PackageKindRow[];
}

export interface GroupPackageIssueRequest {
  kinds?: string[] | undefined;
  enrollmentIds?: string[] | undefined;
  protocolDate?: string | undefined;
  orderDate?: string | undefined;
}

export interface GroupPackageIssueOutcome {
  tasks: number;
  created: number;
  retried: number;
  learnersIncluded: number;
  /** Слушатели, не попавшие в пакет, — поимённо с причинами (принцип частичного успеха). */
  skipped: Array<{ enrollmentId: string; learnerName: string; reasons: string[] }>;
  groupStatus: string;
}

/**
 * Пакет документов группы (МГ-F2.1, срез 21.1): что должна получить группа, что уже выпущено,
 * и выпуск всего пакета одним действием — приказы → протокол → документы слушателей.
 *
 * Живёт в модуле групп: наборы документов курсов, слушатели и статус группы — в его снимке,
 * а модуль документов не может импортировать модуль групп (цикл, `documents.module.ts`).
 */
@Injectable()
export class GroupDocumentPackageService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService
  ) {}

  private requireGroup(tenantId: string, groupId: string) {
    const group = this.state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
    if (!group) throw new NotFoundException({ code: 'not_found', message: 'Группа не найдена' });
    return group;
  }

  private activeEnrollments(tenantId: string, groupId: string) {
    return this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && e.groupId === groupId && e.status !== 'cancelled'
    );
  }

  /** Строки наборов документов всех курсов группы; шаблон, которого больше нет, пропускается. */
  private entries(tenantId: string, groupId: string): PackageEntry[] {
    const versionIds = this.state.groupCourses
      .filter((gc) => gc.tenantId === tenantId && gc.groupId === groupId)
      .map(
        (gc) =>
          gc.courseVersionId ??
          this.state.courseVersions
            .filter((v) => v.tenantId === tenantId && v.courseId === gc.courseId)
            .sort((a, b) => b.versionNo - a.versionNo)[0]?.id
      )
      .filter((id): id is string => Boolean(id));
    return versionIds.flatMap((versionId) =>
      this.mvp.getCourseDocumentSet(tenantId, versionId).flatMap((row): PackageEntry[] => {
        try {
          const template = this.documents.getTemplate(tenantId, row.templateId);
          return [
            {
              kindCode: row.kindCode,
              templateId: row.templateId,
              templateType: template.templateType,
              templateName: template.name,
              isRequired: row.isRequired
            }
          ];
        } catch {
          // Шаблон из набора удалён или недоступен: строка пропускается, а не валит весь пакет —
          // остальные документы группы выпускаются, пропавший вид просто не показывается.
          return [];
        }
      })
    );
  }

  view(tenantId: string, groupId: string): GroupPackageView {
    this.requireGroup(tenantId, groupId);
    const enrollmentIds = this.activeEnrollments(tenantId, groupId).map((e) => e.id);
    const facts = this.documents.groupPackageFacts(tenantId, groupId, enrollmentIds);
    return {
      groupId,
      learners: enrollmentIds.length,
      kinds: packageState({
        groupId,
        entries: this.entries(tenantId, groupId),
        enrollmentIds,
        documents: facts.documents,
        tasks: facts.tasks,
        kindName: (code) => documentKindOf(code)?.name
      })
    };
  }

  /**
   * Выпуск пакета. Слушатели с проблемами из отчёта «что мешает выпустить» в пакет не попадают
   * и называются поимённо; остальные получают документы. Повтор не плодит дублей: уже
   * выпущенное и стоящее в очереди возвращается как есть, упавшее — снова в очередь.
   */
  issue(
    tenantId: string,
    actorId: string | undefined,
    groupId: string,
    request: GroupPackageIssueRequest,
    readiness: IssueReadinessReport,
    ctx: RequestContext
  ): { outcome: GroupPackageIssueOutcome; tasks: DocumentGenerationTaskEntity[] } {
    const group = this.requireGroup(tenantId, groupId);
    const enrollments = this.activeEnrollments(tenantId, groupId).filter(
      (e) => !request.enrollmentIds?.length || request.enrollmentIds.includes(e.id)
    );
    const blocked = new Map(readiness.learners.map((l) => [l.learnerId, l]));
    const skipped = enrollments
      .filter((e) => blocked.has(e.learnerId))
      .map((e) => ({
        enrollmentId: e.id,
        learnerName: blocked.get(e.learnerId)?.learnerName ?? 'слушатель',
        reasons: blocked.get(e.learnerId)?.issues.map((i) => i.message) ?? []
      }));
    const eligible = enrollments.filter((e) => !blocked.has(e.learnerId)).map((e) => e.id);
    const plan = planPackageIssue({
      groupId,
      entries: this.entries(tenantId, groupId),
      kindCodes: request.kinds,
      eligibleEnrollmentIds: eligible
    });
    const result = this.documents.issueGroupPackage(
      tenantId,
      actorId,
      groupId,
      plan.map((item) => {
        const date = item.entry.templateType === 'order' ? request.orderDate : request.protocolDate;
        return {
          templateId: item.entry.templateId,
          templateType: item.entry.templateType,
          sourceEntityType: item.sourceEntityType,
          sourceEntityId: item.sourceEntityId,
          ...(item.entry.kindCode ? { kindCode: item.entry.kindCode } : {}),
          ...(date ? { documentDate: date } : {})
        };
      }),
      ctx
    );
    // МГ-B3.1: «экзамен → документы» — при выпуске пакета (протокол в нём).
    if (group.status === 'exam' && result.tasks.length > 0) {
      this.mvp.setGroupStatus(
        tenantId,
        actorId,
        groupId,
        { status: 'documents', reason: 'Выпущен пакет документов группы' },
        ctx
      );
    }
    return {
      tasks: result.tasks,
      outcome: {
        tasks: result.tasks.length,
        created: result.created,
        retried: result.retried,
        learnersIncluded: eligible.length,
        skipped,
        groupStatus: group.status
      }
    };
  }
}
