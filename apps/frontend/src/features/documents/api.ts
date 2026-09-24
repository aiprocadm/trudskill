import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/*
 * Обращения к серверу вынесены из экрана «как есть» (§8.3, правило SCR-001).
 * Раньше каждый запрос собирал заголовки авторизации прямо в разметке — девять раз
 * подряд один и тот же блок.
 */

export interface TemplateDto {
  id?: string;
  name: string;
  templateType?: string;
  type?: string;
  status: string;
  currentVersion?: string;
  currentVersionId?: string;
  updatedAt: string;
}

export interface TaskDto {
  id: string;
  status: string;
  source: string;
  errorMessage?: string;
  requestedAt?: string;
  finishedAt?: string;
}

export interface TemplateVersionDto {
  id: string;
  versionNo: number;
  fileId: string;
  isActive: boolean;
}

export interface TemplateVariableDto {
  id: string;
  variableCode: string;
  displayName: string;
  categoryCode: string;
}

export interface TemplateBindingDto {
  id: string;
  bindType: string;
  groupId?: string;
  courseId?: string;
  directionId?: string;
  /** МГ-F1.1: вид документа из каталога; пусто — любой вид этого типа. */
  kindCode?: string;
}

const auth = (session: UserSession) => ({
  auth: {
    accessToken: session.tokens.accessToken,
    tenantId: session.user.tenantId,
    userId: session.user.id
  }
});

export const documentsApi = {
  async overview(session: UserSession) {
    const [templatesResp, tasksResp] = await Promise.all([
      apiRequest<{ items: TemplateDto[] }>('/templates', auth(session)),
      apiRequest<{ items: TaskDto[] }>('/document-tasks', auth(session))
    ]);
    const templates = templatesResp.items.map((item) => ({
      ...item,
      type: item.templateType ?? item.type ?? ''
    }));
    return { templates, tasks: tasksResp.items };
  },

  versions(session: UserSession, templateId: string) {
    const qs = new URLSearchParams({ templateId });
    return apiRequest<{ items: TemplateVersionDto[] }>(
      `/template-versions?${qs.toString()}`,
      auth(session)
    );
  },

  variables(session: UserSession, templateVersionId: string) {
    const qs = new URLSearchParams({ templateVersionId });
    return apiRequest<{ items: TemplateVariableDto[] }>(
      `/template-variables?${qs.toString()}`,
      auth(session)
    );
  },

  bindings(session: UserSession, templateId: string) {
    const qs = new URLSearchParams({ templateId });
    return apiRequest<{ items: TemplateBindingDto[] }>(
      `/template-bindings?${qs.toString()}`,
      auth(session)
    );
  },

  createTemplate(session: UserSession, body: { name: string; templateType: string }) {
    return apiRequest('/templates', { method: 'POST', body, ...auth(session) });
  },

  generate(
    session: UserSession,
    body: {
      templateId: string;
      sourceEntityType: string;
      sourceEntityId: string;
      documentType: string;
      idempotencyKey: string;
    }
  ) {
    return apiRequest('/documents/generate', { method: 'POST', body, ...auth(session) });
  },

  generateBatch(
    session: UserSession,
    body: {
      templateId: string;
      sourceEntityType: string;
      sourceEntityIds: string[];
      documentType: string;
    }
  ) {
    return apiRequest('/documents/generate/batch', { method: 'POST', body, ...auth(session) });
  },

  retryTask(session: UserSession, taskId: string) {
    return apiRequest(`/document-tasks/${taskId}/retry`, { method: 'POST', ...auth(session) });
  },

  cancelTask(session: UserSession, taskId: string) {
    return apiRequest(`/document-tasks/${taskId}/cancel`, { method: 'POST', ...auth(session) });
  },

  createVariable(
    session: UserSession,
    body: {
      templateVersionId: string;
      variableCode: string;
      displayName: string;
      categoryCode: string;
      dataType: string;
      isRequired: boolean;
    }
  ) {
    return apiRequest('/template-variables', { method: 'POST', body, ...auth(session) });
  },

  createBinding(
    session: UserSession,
    body: {
      templateId: string;
      bindType: string;
      groupId?: string | undefined;
      courseId?: string | undefined;
      directionId?: string | undefined;
      kindCode?: string | undefined;
    }
  ) {
    return apiRequest('/template-bindings', { method: 'POST', body, ...auth(session) });
  }
};
