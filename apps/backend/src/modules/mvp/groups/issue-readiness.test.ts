import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { IssueReadinessController } from './issue-readiness.controller.js';
import {
  buildIssueReadiness,
  learnerIssues,
  requireConsentBeforeIssueFrom
} from './issue-readiness.js';
import { IssueReadinessService } from './issue-readiness.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { missingIssuanceSteps } from '../../documents/issuance-readiness.service.js';
import { REQUIRED_PERMISSIONS } from '../../iam/permission.decorator.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { ExamReadinessIssue } from '../exam-readiness.js';

const T = 'tenant_demo';
const ready = { dateOfBirth: '1990-01-01', position: 'Электрик', resultCode: 'passed' as const };

describe('что мешает выпустить документы: правила (МГ-F5.1, срез 20.1)', () => {
  it('у слушателя проверяются дата рождения, должность и результат аттестации', () => {
    expect(learnerIssues({ id: 'l1', fullName: 'Иванов Иван', ...ready }, false)).toEqual([]);
    const codes = learnerIssues({ id: 'l1', fullName: 'Иванов Иван' }, false).map((i) => i.code);
    expect(codes).toEqual([
      'learner_birth_date_missing',
      'learner_position_missing',
      'exam_result_missing'
    ]);
    expect(
      learnerIssues({ id: 'l1', fullName: 'Иванов', ...ready, resultCode: 'absent' }, false)[0]
        ?.message
    ).toContain('Не явился');
  });

  it('согласие проверяется, только когда центр его требует', () => {
    expect(learnerIssues({ id: 'l1', fullName: 'Иванов', ...ready }, false)).toEqual([]);
    expect(
      learnerIssues({ id: 'l1', fullName: 'Иванов', ...ready, consent: false }, true).map(
        (i) => i.code
      )
    ).toEqual(['learner_consent_missing']);
    expect(requireConsentBeforeIssueFrom({ documents: { requireConsentBeforeIssue: true } })).toBe(
      true
    );
    expect(requireConsentBeforeIssueFrom({ documents: { requireConsentBeforeIssue: 'да' } })).toBe(
      false
    );
    expect(requireConsentBeforeIssueFrom(null)).toBe(false);
  });

  it('СНИЛС по нескольким курсам — один раз; готово, только когда пусто на всех трёх уровнях', () => {
    const snils: ExamReadinessIssue = {
      scope: 'learner',
      subjectId: 'l1',
      subjectName: 'Иванов Иван',
      code: 'learner_snils_missing',
      message: 'Не заполнен СНИЛС'
    };
    const commission: ExamReadinessIssue = {
      scope: 'commission',
      code: 'commission_too_small',
      message: 'В комиссии 2 чел.'
    };
    const report = buildIssueReadiness({
      center: [],
      groupIssues: [],
      examIssues: [snils, snils, commission, commission],
      learners: [
        { id: 'l1', fullName: 'Иванов Иван', ...ready },
        { id: 'l2', fullName: 'Абрамова Анна', ...ready }
      ],
      requireConsent: false
    });
    expect(report.ready).toBe(false);
    expect(report.group.map((i) => i.code)).toEqual(['commission_too_small']);
    expect(report.learners).toEqual([
      {
        learnerId: 'l1',
        learnerName: 'Иванов Иван',
        issues: [{ code: 'learner_snils_missing', message: 'Не заполнен СНИЛС' }]
      }
    ]);
    expect(report.totals).toEqual({ learners: 2, learnersReady: 1 });

    const clean = buildIssueReadiness({
      center: [],
      groupIssues: [],
      examIssues: [],
      learners: [{ id: 'l2', fullName: 'Абрамова Анна', ...ready }],
      requireConsent: false
    });
    expect(clean.ready).toBe(true);
  });

  it('шаги центра — словами, с кодом на каждый недостающий', () => {
    const items = missingIssuanceSteps({
      requisites: true,
      license: false,
      commission: true,
      template: true,
      numbering: false
    });
    expect(items.map((i) => i.code)).toEqual([
      'center_license_missing',
      'center_numbering_missing'
    ]);
    expect(items[0]?.message).toContain('лицензию');
  });
});

describe('что мешает выпустить документы: сбор и ручка (МГ-F5.1, срез 20.1)', () => {
  it('факты группы: курсы, слушатели без отменённых, результат по записи', () => {
    const state = new InMemoryMvpState();
    state.groups.push({ id: 'g1', tenantId: T, code: '264501', name: 'Группа' } as never);
    state.learners.push(
      {
        id: 'l1',
        tenantId: T,
        lastName: 'Иванов',
        firstName: 'Иван',
        position: 'Электрик'
      } as never,
      { id: 'l2', tenantId: T, lastName: 'Петров', firstName: 'Пётр' } as never
    );
    state.enrollments.push(
      {
        id: 'e1',
        tenantId: T,
        groupId: 'g1',
        learnerId: 'l1',
        status: 'completed',
        resultCode: 'passed'
      } as never,
      { id: 'e2', tenantId: T, groupId: 'g1', learnerId: 'l2', status: 'cancelled' } as never
    );
    const mvp = new MvpService(
      state,
      new TenantScopedRepository(),
      { write: vi.fn() } as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as never
    );
    const facts = mvp.issueReadinessFacts(T, 'g1');
    expect(facts.groupIssues.map((i) => i.code)).toEqual(['group_courses_missing']);
    expect(facts.learners).toEqual([
      expect.objectContaining({ id: 'l1', fullName: 'Иванов Иван', resultCode: 'passed' })
    ]);
    expect(() => mvp.issueReadinessFacts('tenant_other', 'g1')).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'not_found' }) })
    );
  });

  it('служба спрашивает согласия только при включённой настройке и добавляет шаги центра', async () => {
    const hasActiveConsent = vi.fn().mockResolvedValue(false);
    const off = new IssueReadinessService(
      { hasActiveConsent } as never,
      { getSettings: vi.fn().mockRejectedValue(new Error('404')) } as never,
      {
        readiness: vi.fn().mockResolvedValue({
          requisites: false,
          license: true,
          commission: true,
          template: true,
          numbering: true
        })
      } as never
    );
    const facts = {
      groupIssues: [],
      examIssues: [],
      learners: [{ id: 'l1', fullName: 'Иванов Иван', ...ready }]
    };
    const first = await off.report(T, facts);
    expect(hasActiveConsent).not.toHaveBeenCalled();
    expect(first.consentRequired).toBe(false);
    expect(first.center.map((i) => i.code)).toEqual(['center_requisites_missing']);

    const on = new IssueReadinessService(
      { hasActiveConsent } as never,
      {
        getSettings: vi
          .fn()
          .mockResolvedValue({ payload: { documents: { requireConsentBeforeIssue: true } } })
      } as never
    );
    const second = await on.report(T, facts);
    expect(hasActiveConsent).toHaveBeenCalledWith(T, 'l1', 'personal_data');
    expect(second.learners[0]?.issues.map((i) => i.code)).toEqual(['learner_consent_missing']);
    expect(second.center).toEqual([]);
  });

  it('ручка — под правом чтения групп', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, IssueReadinessController.prototype.issueReadiness)
    ).toEqual(['groups.read']);
  });
});
