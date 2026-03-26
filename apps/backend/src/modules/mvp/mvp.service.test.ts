import { describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException, PreconditionFailedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { MvpService } from './mvp.service.js';

const ctx = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

describe('mvp service domain rules', () => {
  it('requires at least one version before course publish', () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'C1', title: 'Course 1' }, ctx);
    expect(() => service.publishCourse('tenant_demo', ctx.userId, course.id, ctx)).toThrow(PreconditionFailedException);

    service.createCourseVersion('tenant_demo', course.id);
    const published = service.publishCourse('tenant_demo', ctx.userId, course.id, ctx);
    expect(published.status).toBe('published');
  });

  it('enforces unique enrollment by (group, learner)', () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'G1', name: 'Group' }, ctx);
    const learner = service.createLearner('tenant_demo', ctx.userId, { code: 'L1', name: 'John Doe' }, ctx);
    service.createEnrollment('tenant_demo', ctx.userId, { groupId: group.id, learnerId: learner.id }, ctx);

    expect(() =>
      service.createEnrollment('tenant_demo', ctx.userId, { groupId: group.id, learnerId: learner.id }, ctx)
    ).toThrow(ConflictException);
  });

  it('tracks enrollment status transitions and history', () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'G1', name: 'Group' }, ctx);
    const learner = service.createLearner('tenant_demo', ctx.userId, { code: 'L1', name: 'John Doe' }, ctx);
    const enrollment = service.createEnrollment('tenant_demo', ctx.userId, { groupId: group.id, learnerId: learner.id }, ctx);

    const active = service.changeEnrollmentStatus('tenant_demo', ctx.userId, enrollment.id, { status: 'active' }, ctx);
    expect(active.status).toBe('active');

    expect(() => service.changeEnrollmentStatus('tenant_demo', ctx.userId, enrollment.id, { status: 'pending' }, ctx)).toThrow(
      PreconditionFailedException
    );

    const history = service.listEnrollmentStatusHistory('tenant_demo', enrollment.id);
    expect(history.map((item) => item.status)).toEqual(['pending', 'active']);
  });

  it('calculates progress based on min_view_seconds and aggregates module/course', () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'C1', title: 'Course' }, ctx);
    const version = service.createCourseVersion('tenant_demo', course.id);
    const module = service.createModule('tenant_demo', ctx.userId, { courseVersionId: version.id, title: 'M1', minViewSeconds: 0 }, ctx);
    const material = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: module.id, title: 'Mat', materialType: 'video', minViewSeconds: 100 },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'G1', name: 'Group' }, ctx);
    const learner = service.createLearner('tenant_demo', ctx.userId, { code: 'L1', name: 'John Doe' }, ctx);
    const enrollment = service.createEnrollment('tenant_demo', ctx.userId, { groupId: group.id, learnerId: learner.id }, ctx);

    const p1 = service.upsertMaterialProgress('tenant_demo', ctx.userId, material.id, { enrollmentId: enrollment.id, studiedSeconds: 40 }, ctx);
    expect(p1.status).toBe('in_progress');
    expect(p1.progressPercent).toBe(40);

    service.upsertMaterialProgress('tenant_demo', ctx.userId, material.id, { enrollmentId: enrollment.id, studiedSeconds: 100 }, ctx);
    const courseProgress = service.listProgress('tenant_demo', {}).items[0];
    expect(courseProgress.status).toBe('completed');
    expect(courseProgress.progressPercent).toBe(100);
    expect(courseProgress.calculatedAt).toBeDefined();
  });

  it('enforces tenant isolation', () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'C1', title: 'Course' }, ctx);
    expect(() => service.getCourse('tenant_other', course.id)).toThrow(ForbiddenException);
  });

  it('writes audit events for critical actions', () => {
    const audit = new AuditService();
    const service = new MvpService(new TenantScopedRepository(), audit);
    service.createCounterparty('tenant_demo', ctx.userId, { code: 'CP1', name: 'Org 1' }, ctx);
    service.createLearner('tenant_demo', ctx.userId, { code: 'L1', name: 'John Doe' }, ctx);
    expect(audit.list().some((item) => item.action === 'crm.counterparty_created')).toBe(true);
    expect(audit.list().some((item) => item.action === 'learning.learner_created')).toBe(true);
  });

  it('updates module/material/group and writes audit events', () => {
    const audit = new AuditService();
    const service = new MvpService(new TenantScopedRepository(), audit);
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'G1', name: 'Group' }, ctx);
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'C1', title: 'Course' }, ctx);
    const version = service.createCourseVersion('tenant_demo', course.id);
    const module = service.createModule('tenant_demo', ctx.userId, { courseVersionId: version.id, title: 'M1' }, ctx);
    const material = service.createMaterial('tenant_demo', ctx.userId, { moduleId: module.id, title: 'Mat', materialType: 'file' }, ctx);

    const updatedGroup = service.updateGroup('tenant_demo', ctx.userId, group.id, { name: 'Group 2' }, ctx);
    const updatedModule = service.updateModule('tenant_demo', ctx.userId, module.id, { minViewSeconds: 15 }, ctx);
    const updatedMaterial = service.updateMaterial('tenant_demo', ctx.userId, material.id, { fileId: 'file_1', isRequired: false }, ctx);

    expect(updatedGroup.name).toBe('Group 2');
    expect(updatedModule.minViewSeconds).toBe(15);
    expect(updatedMaterial.fileId).toBe('file_1');
    expect(audit.list().some((item) => item.action === 'learning.group_updated')).toBe(true);
    expect(audit.list().some((item) => item.action === 'learning.module_updated')).toBe(true);
    expect(audit.list().some((item) => item.action === 'learning.material_updated')).toBe(true);
  });
});
