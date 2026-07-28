import { Inject, Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';

import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { CourseVersion, Enrollment, Material } from '../mvp.types.js';

/**
 * Право слушателя работать с видео-уроком (ФТ-B2.1/B3.1, Фаза 2).
 *
 * Одна цепочка на две задачи: выдачу ссылки на просмотр (Task 4) и приём прогресса
 * (Task 6). Держать её в двух местах опасно — разойдутся, и одна из дверей окажется
 * без замка.
 *
 * Цепочка та же, что у запуска SCORM (`scorm.service.ts`): материал → модуль → версия
 * курса → зачисление → связь группы с курсом → совпадение actor'а со слушателем.
 * Request-scoped, потому что читает состояние тенанта.
 */
export interface VideoAccessContext {
  material: Material;
  courseVersion: CourseVersion;
  enrollment: Enrollment;
}

@Injectable()
export class VideoAccessService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  assertLearnerMayWatch(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    enrollmentId: string,
    ctx: RequestContext,
    /** Какие типы материала допустимы. По умолчанию видео (ФТ-B2.1). */
    allowedTypes: readonly string[] = ['video']
  ): VideoAccessContext {
    const material = this.state.materials.find(
      (m) => m.tenantId === tenantId && m.id === materialId
    );
    if (!material) {
      throw new NotFoundException({ code: 'not_found', message: 'Material not found' });
    }
    if (!allowedTypes.includes(material.materialType)) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: `Этот материал не относится к типам: ${allowedTypes.join(', ')}`
      });
    }
    const moduleEntity = this.state.modules.find(
      (m) => m.tenantId === tenantId && m.id === material.moduleId
    );
    const courseVersion = moduleEntity
      ? this.state.courseVersions.find(
          (v) => v.tenantId === tenantId && v.id === moduleEntity.courseVersionId
        )
      : undefined;
    const enrollment = this.state.enrollments.find(
      (e) => e.tenantId === tenantId && e.id === enrollmentId
    );
    if (!enrollment || !courseVersion) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Зачисление для этого урока не найдено'
      });
    }
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (gc) =>
        gc.tenantId === tenantId &&
        gc.groupId === enrollment.groupId &&
        gc.courseId === courseVersion.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Зачисление не связано с курсом этого урока'
      });
    }
    // Ссылку и прогресс получает владелец зачисления (или тот, кому разрешено
    // действовать за него — делегирование learners.act_as).
    this.mvp.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      ctx.permissions
    );

    // ФТ-E1: правило прохождения курса проверяется ЗДЕСЬ, а не только в интерфейсе.
    // Клиентский замок на карточке модуля снимается через DevTools; настоящий запрет —
    // отказ выдать материал.
    this.assertSequentialModules(tenantId, material, courseVersion, enrollment.id);

    return { material, courseVersion, enrollment };
  }

  /**
   * Строгий порядок модулей (ФТ-E1). Материал модуля недоступен, пока не закрыты
   * ОБЯЗАТЕЛЬНЫЕ материалы всех модулей, идущих раньше по `sortOrder`.
   *
   * Почему не «весь предыдущий модуль целиком»: необязательные материалы методист
   * добавляет как справочные, и запирать курс из-за непрочитанной методички нельзя.
   */
  private assertSequentialModules(
    tenantId: string,
    material: Material,
    courseVersion: CourseVersion,
    enrollmentId: string
  ): void {
    if (!courseVersion.sequentialModules) return;

    const currentModule = this.state.modules.find(
      (m) => m.tenantId === tenantId && m.id === material.moduleId
    );
    if (!currentModule) return;

    const priorModules = this.state.modules
      .filter(
        (m) =>
          m.tenantId === tenantId &&
          m.courseVersionId === currentModule.courseVersionId &&
          m.sortOrder < currentModule.sortOrder
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const prior of priorModules) {
      const required = this.state.materials.filter(
        (m) => m.tenantId === tenantId && m.moduleId === prior.id && m.isRequired
      );
      const unfinished = required.filter((item) => {
        const progress = this.state.materialProgress.find(
          (p) =>
            p.tenantId === tenantId && p.enrollmentId === enrollmentId && p.materialId === item.id
        );
        return progress?.status !== 'completed';
      });
      if (unfinished.length) {
        throw new PreconditionFailedException({
          code: 'module_sequence_locked',
          message: `Сначала завершите модуль «${prior.title}» — в нём осталось незакрытых материалов: ${unfinished.length}`
        });
      }
    }
  }
}
