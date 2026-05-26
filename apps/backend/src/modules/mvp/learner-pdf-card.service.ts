import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { DocumentsService } from '../documents/documents.service.js';

import type { Course, CourseVersion, Enrollment, Learner } from './mvp.types.js';
import type { GeneratedDocumentEntity } from '../documents/documents.types.js';

export interface LearnerPdfCardEnrollment {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  courseVersionId: string;
  academicHours?: number;
  trainingType?: string;
  enrolledAt: string;
  completedAt?: string;
  status: string;
}

export interface LearnerPdfCardDocument {
  id: string;
  documentNumber?: string;
  documentDate?: string;
  documentType: string;
  status: string;
}

export interface LearnerPdfCardAggregate {
  learner: {
    id: string;
    learnerNo?: string;
    fullName: string;
    snils?: string;
    position?: string;
    email?: string;
  };
  enrollments: LearnerPdfCardEnrollment[];
  documents: LearnerPdfCardDocument[];
}

/**
 * Pillar A Plan C §5.11 — агрегация данных для PDF-карточки ученика.
 *
 * Plan C deviation: возвращает JSON aggregate, а не binary PDF. Полноценный
 * PDF-render будет подключён в Phase 5 через существующий document generation
 * pipeline (background worker + шаблоны типа `report`). Сейчас этот endpoint
 * сразу же используется фронтом для отображения «Учебная история» и «Выданные
 * документы» секций, а кнопка «Скачать PDF» показывает stub-сообщение.
 */
@Injectable()
export class LearnerPdfCardService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(DocumentsService) private readonly documentsService: DocumentsService
  ) {}

  composeData(tenantId: string, learnerId: string): LearnerPdfCardAggregate {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({ code: 'learner_not_found', message: 'Ученик не найден' });
    }

    const enrollments = this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && e.learnerId === learnerId
    );

    const enrollmentRows: LearnerPdfCardEnrollment[] = enrollments.map((enr) =>
      this.composeEnrollmentRow(tenantId, enr)
    );

    const enrollmentIds = new Set(enrollments.map((e) => e.id));
    const documents = this.documentsService
      .listDocuments(tenantId, { sourceEntityType: 'enrollment' })
      .items.filter((d: GeneratedDocumentEntity) =>
        d.sourceEntityId ? enrollmentIds.has(d.sourceEntityId) : false
      );

    const documentRows: LearnerPdfCardDocument[] = documents.map((d) => ({
      id: d.id,
      documentNumber: d.documentNumber,
      documentDate: d.documentDate,
      documentType: d.documentType,
      status: d.status
    }));

    return {
      learner: {
        id: learner.id,
        learnerNo: learner.learnerNo,
        fullName: this.composeFullName(learner),
        snils: learner.snils,
        position: learner.position,
        email: learner.email
      },
      enrollments: enrollmentRows,
      documents: documentRows
    };
  }

  private composeEnrollmentRow(tenantId: string, enr: Enrollment): LearnerPdfCardEnrollment {
    const groupCourse = this.state.groupCourses.find(
      (gc) => gc.tenantId === tenantId && gc.groupId === enr.groupId
    );
    const course: Course | undefined = groupCourse
      ? this.state.courses.find((c) => c.tenantId === tenantId && c.id === groupCourse.courseId)
      : undefined;
    const courseVersion: CourseVersion | undefined = course
      ? [...this.state.courseVersions]
          .filter((cv) => cv.tenantId === tenantId && cv.courseId === course.id)
          .sort((a, b) => b.versionNo - a.versionNo)[0]
      : undefined;

    return {
      enrollmentId: enr.id,
      courseId: course?.id ?? '',
      courseTitle: course?.title ?? '',
      courseVersionId: courseVersion?.id ?? '',
      academicHours: courseVersion?.academicHours,
      trainingType: courseVersion?.trainingType,
      enrolledAt: enr.enrolledAt,
      completedAt: enr.completedAt,
      status: enr.status
    };
  }

  private composeFullName(learner: Learner): string {
    return [learner.lastName, learner.firstName, learner.middleName]
      .filter((p): p is string => Boolean(p && p.trim()))
      .join(' ')
      .trim();
  }
}
