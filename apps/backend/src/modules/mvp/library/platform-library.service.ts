import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';

import {
  type LibraryCourseContent,
  buildCopyPlan,
  buildLibrarySnapshot
} from './library-course.util.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * ФТ-D6 (Фаза 4 Task 10): библиотека курсов платформы.
 *
 * Каталог хранит СНИМКИ курсов (0078), а не ссылки на курсы арендаторов: снимок не
 * ломается при правке источника и копируется воспроизводимо. «Подписка с обновлениями»
 * (ТЗ, позже) ляжет поверх версионированием снимка.
 */

export interface LibraryCourseRow {
  id: string;
  code: string;
  title: string;
  description: string;
  publishedAt: string;
  /** Сколько материалов приедет без содержимого — видно ДО копирования. */
  materialsNeedingContent: number;
  moduleCount: number;
}

@Injectable()
export class PlatformLibraryService {
  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  private requireDb(): DatabaseService {
    if (!this.databaseService) {
      throw new ServiceUnavailableException({
        code: 'library_store_unavailable',
        message: 'Library store is unavailable'
      });
    }
    return this.databaseService;
  }

  async listCourses(): Promise<LibraryCourseRow[]> {
    const rows = await this.requireDb().query<{
      id: string;
      code: string;
      title: string;
      description: string;
      publishedAt: string;
      content: LibraryCourseContent;
    }>(
      `select id, code, title, description, published_at as "publishedAt", content
       from core.platform_library_courses order by title`
    );
    return rows.map((row) => {
      const modules = row.content?.modules ?? [];
      return {
        id: row.id,
        code: row.code,
        title: row.title,
        description: row.description,
        publishedAt: row.publishedAt,
        moduleCount: modules.length,
        materialsNeedingContent: modules
          .flatMap((m) => m.materials ?? [])
          .filter((m) => m.needsContent).length
      };
    });
  }

  /**
   * Публикация курса центра-источника в каталог. Снимок снимается ЧЕРЕЗ раннер:
   * состояние источника читается тем же способом, что и везде вне запроса.
   */
  async publish(
    actorId: string | undefined,
    input: { sourceTenantId: string; courseId: string },
    context: RequestContext
  ): Promise<{ id: string; code: string; title: string }> {
    const db = this.requireDb();
    const content = await this.mvpRunner.runWithTenantState(input.sourceTenantId, async (state) => {
      const course = state.courses.find(
        (c) => c.tenantId === input.sourceTenantId && c.id === input.courseId
      );
      if (!course) return null;
      return buildLibrarySnapshot({
        course,
        versions: state.courseVersions.filter((v) => v.tenantId === input.sourceTenantId) as never,
        modules: state.modules.filter((m) => m.tenantId === input.sourceTenantId) as never,
        materials: state.materials.filter((m) => m.tenantId === input.sourceTenantId) as never
      });
    });
    if (!content) {
      throw new NotFoundException({ code: 'course_not_found', message: 'Course not found' });
    }

    const duplicates = await db.query<{ id: string }>(
      'select id from core.platform_library_courses where code = $1',
      [content.course.code]
    );
    if (duplicates.length > 0) {
      throw new ConflictException({
        code: 'library_code_taken',
        message: `Курс с кодом "${content.course.code}" уже есть в библиотеке`
      });
    }

    const id = `lib_${content.course.code}`.replaceAll(/[^\w-]/g, '_');
    await db.query(
      `insert into core.platform_library_courses (id, code, title, description, content, source_tenant_id)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        id,
        content.course.code,
        content.course.title,
        content.course.description,
        JSON.stringify(content),
        input.sourceTenantId
      ]
    );
    await this.auditService.writeCritical({
      tenantId: 'platform',
      actorId,
      action: 'platform.library_course_published',
      entityType: 'core.platform_library_course',
      entityId: id,
      metadata: { code: content.course.code, sourceTenantId: input.sourceTenantId },
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    return { id, code: content.course.code, title: content.course.title };
  }

  async unpublish(
    actorId: string | undefined,
    libraryCourseId: string,
    context: RequestContext
  ): Promise<{ removed: true }> {
    const db = this.requireDb();
    const rows = await db.query<{ id: string }>(
      'delete from core.platform_library_courses where id = $1 returning id',
      [libraryCourseId]
    );
    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'library_course_not_found',
        message: 'Library course not found'
      });
    }
    await this.auditService.writeCritical({
      tenantId: 'platform',
      actorId,
      action: 'platform.library_course_removed',
      entityType: 'core.platform_library_course',
      entityId: libraryCourseId,
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    return { removed: true };
  }

  /**
   * Копия курса из каталога в СВОЙ центр. Работает в текущем request-scoped состоянии
   * (перехватчик сохранит его в конце запроса), поэтому копия появляется как обычный
   * курс центра — с ней дальше работают штатными экранами.
   */
  async copyToTenant(
    tenantId: string,
    actorId: string | undefined,
    libraryCourseId: string,
    context: RequestContext
  ): Promise<{ courseId: string; code: string; materialsNeedingContent: number }> {
    const rows = await this.requireDb().query<{ content: LibraryCourseContent }>(
      'select content from core.platform_library_courses where id = $1',
      [libraryCourseId]
    );
    const content = rows[0]?.content;
    if (!content) {
      throw new NotFoundException({
        code: 'library_course_not_found',
        message: 'Library course not found'
      });
    }

    const existingCodes = this.state.courses
      .filter((c) => c.tenantId === tenantId)
      .map((c) => c.code);
    const plan = buildCopyPlan(content, existingCodes);

    const course = this.mvp.createCourse(
      tenantId,
      actorId,
      { code: plan.course.code, title: plan.course.title, description: plan.course.description },
      context
    );
    const version = this.mvp.createCourseVersion(tenantId, course.id);
    if (Object.keys(plan.programMeta).length > 0) {
      this.mvp.updateProgramMeta(tenantId, actorId, version.id, plan.programMeta, context);
    }
    for (const module of plan.modules) {
      // Порядок модулей и материалов задаёт сам сервис по очереди создания
      // (`sortOrder: this.state.modules.length`), поэтому передавать его не нужно —
      // достаточно создавать в уже отсортированном порядке снимка.
      const created = this.mvp.createModule(
        tenantId,
        actorId,
        { courseVersionId: version.id, title: module.title, isRequired: module.isRequired },
        context
      );
      for (const material of module.materials) {
        this.mvp.createMaterial(
          tenantId,
          actorId,
          {
            moduleId: created.id,
            title: material.title,
            materialType: material.materialType,
            minViewSeconds: material.minViewSeconds,
            isRequired: material.isRequired
          },
          context
        );
      }
    }

    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'learning.library_course_copied',
      entityType: 'learning.course',
      entityId: course.id,
      metadata: { libraryCourseId, code: plan.course.code },
      requestId: context.requestId,
      correlationId: context.correlationId
    });

    return {
      courseId: course.id,
      code: plan.course.code,
      materialsNeedingContent: plan.materialsNeedingContent
    };
  }
}
