import { apiRequest } from '../../lib/api/client';

import type {
  BuildReportRequest,
  ReportEntitiesMeta,
  ReportExport,
  ReportPreview,
  ReportTemplate,
  SaveReportTemplateRequest
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const reportBuilderApi = {
  entities: (session: UserSession): Promise<ReportEntitiesMeta> =>
    apiRequest<ReportEntitiesMeta>('/reports/builder/entities', withAuth(session)),

  preview: (session: UserSession, req: BuildReportRequest): Promise<ReportPreview> =>
    apiRequest<ReportPreview>('/reports/builder/preview', {
      method: 'POST',
      body: req,
      ...withAuth(session)
    }),

  export: (session: UserSession, req: BuildReportRequest): Promise<ReportExport> =>
    apiRequest<ReportExport>('/reports/builder/export', {
      method: 'POST',
      body: req,
      ...withAuth(session)
    }),

  listTemplates: (session: UserSession): Promise<ReportTemplate[]> =>
    apiRequest<ReportTemplate[]>('/reports/builder/templates', withAuth(session)),

  saveTemplate: (session: UserSession, req: SaveReportTemplateRequest): Promise<ReportTemplate> =>
    apiRequest<ReportTemplate>('/reports/builder/templates', {
      method: 'POST',
      body: req,
      ...withAuth(session)
    }),

  deleteTemplate: (session: UserSession, id: string): Promise<{ id: string }> =>
    apiRequest<{ id: string }>(`/reports/builder/templates/${id}`, {
      method: 'DELETE',
      ...withAuth(session)
    })
};
