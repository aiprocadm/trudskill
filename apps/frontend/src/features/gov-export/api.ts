import { apiRequest } from '../../lib/api/client';

import type {
  OtRegistryBatch,
  OtRegistryExportOutcome,
  OtRegistryImportOutcome,
  OtTrainingProgram
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const govExportApi = {
  listOtTrainingPrograms: (session: UserSession): Promise<OtTrainingProgram[]> =>
    apiRequest<OtTrainingProgram[]>('/ot-training-programs', withAuth(session)),

  createOtRegistryExport: (
    session: UserSession,
    body: {
      groupId?: string;
      clientId?: string;
      enrolledFrom?: string;
      enrolledTo?: string;
    }
  ): Promise<OtRegistryExportOutcome> =>
    apiRequest<OtRegistryExportOutcome>('/ot-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listBatches: (session: UserSession): Promise<OtRegistryBatch[]> =>
    apiRequest<OtRegistryBatch[]>('/ot-registry/exports', withAuth(session)),

  getBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/ot-registry/exports/${id}/file`, withAuth(session)),

  importResponse: (
    session: UserSession,
    id: string,
    fileBase64: string
  ): Promise<OtRegistryImportOutcome> =>
    apiRequest<OtRegistryImportOutcome>(`/ot-registry/exports/${id}/registry-response`, {
      method: 'POST',
      body: { fileBase64 },
      ...withAuth(session)
    })
};
