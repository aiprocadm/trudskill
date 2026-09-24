/**
 * МГ-B2 (ТЗ перехода §6.2), срез 8.5 — E2E smoke мастера создания группы.
 *
 * Контур по конвенциям проекта (см. admin-bulk-enrollment.e2e.test.ts): доступ к маршруту,
 * связка «вставка строк → тело запроса» в форме DTO сервера, smoke-импорт модулей экрана.
 * React не монтируется; поведение сервера покрыто `group-wizard.service.test.ts` бэкенда.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_WIZARD_STATE,
  buildWizardRequest,
  canProceed,
  parseLearnerLines
} from '../features/groups/group-wizard/group-wizard-model';
import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const curator: UserSession = {
  user: {
    id: 'u_curator',
    tenantId: 'tenant_demo',
    login: 'curator',
    email: null,
    status: 'active',
    displayName: 'Куратор'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['manager'],
  permissions: ['groups.read', 'groups.write', 'learners.write', 'enrollments.write']
};

describe('group wizard E2E smoke', () => {
  it('routes: /groups/new открыт с groups.read, без прав — запрет, без входа — на вход', () => {
    expect(evaluateRouteAccess('/groups/new', curator)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/groups/new', { ...curator, permissions: [] })).toEqual({
      kind: 'forbidden'
    });
    expect(evaluateRouteAccess('/groups/new', null)).toEqual({ kind: 'redirect-login' });
  });

  it('pipeline: шаги пропускают только готовое состояние, тело запроса совпадает с DTO сервера', () => {
    const state = {
      ...EMPTY_WIZARD_STATE,
      name: 'ООО «Конкретсити», R11',
      counterpartyId: 'cp_1',
      courseIds: ['course_r11'],
      startDate: '2026-11-05',
      endDate: '2026-12-18',
      examDate: '2026-12-18',
      learnerText: 'Иванов Иван Иванович; инженер; 112-233-445 95; ivan@x.ru',
      accessMode: 'email' as const
    };
    expect(canProceed('who', EMPTY_WIZARD_STATE).ok).toBe(false);
    expect(canProceed('what', { ...state, courseIds: [] }).ok).toBe(false);
    for (const step of ['who', 'what', 'learners', 'access'] as const) {
      expect(canProceed(step, state)).toEqual({ ok: true });
    }

    const request = buildWizardRequest({ ...state, draftId: 'g_draft' }, 'idem-1', 'u_curator');
    /* Форма — как у GroupWizardRequest бэкенда: ключ, group.draftId, courses[].courseId, learners.rows[].rowNumber, access.mode. */
    expect(request).toMatchObject({
      idempotencyKey: 'idem-1',
      group: {
        draftId: 'g_draft',
        name: 'ООО «Конкретсити», R11',
        counterpartyId: 'cp_1',
        responsibleUserId: 'u_curator'
      },
      courses: [{ courseId: 'course_r11' }],
      learners: {
        rows: [{ rowNumber: 1, fullName: 'Иванов Иван Иванович', snils: '112-233-445 95' }]
      },
      access: { mode: 'email' }
    });
    expect(request.learners?.existingIds).toBeUndefined();
    expect(parseLearnerLines('').length).toBe(0);
  });

  it('smoke: модули экрана и шагов загружаются (нет сломанных импортов)', async () => {
    const screen = await import('../features/groups/group-wizard/group-wizard-screen');
    expect(typeof screen.GroupWizardScreen).toBe('function');
    const steps = await import('../features/groups/group-wizard/group-wizard-steps');
    for (const name of [
      'StepWho',
      'StepWhat',
      'StepLearners',
      'StepAccess',
      'WizardResult'
    ] as const) {
      expect(typeof steps[name]).toBe('function');
    }
  });
});
