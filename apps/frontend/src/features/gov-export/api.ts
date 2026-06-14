import { apiRequest } from '../../lib/api/client';

import type {
  EisotTestingBatch,
  EisotTestingExportOutcome,
  FrdoRegistryBatch,
  FrdoRegistryExportOutcome,
  NmoBatch,
  NmoExportOutcome,
  OtRegistryBatch,
  OtRegistryExportOutcome,
  OtRegistryImportOutcome,
  OtTrainingProgram,
  RostechnadzorBatch,
  RostechnadzorExportOutcome
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
      format?: 'xlsx' | 'xml';
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
    }),

  createFrdoRegistryExport: (
    session: UserSession,
    body: {
      from?: string;
      to?: string;
      types?: ('certificate' | 'diploma')[];
      groupId?: string;
      clientId?: string;
    }
  ): Promise<FrdoRegistryExportOutcome> =>
    apiRequest<FrdoRegistryExportOutcome>('/frdo-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listFrdoBatches: (session: UserSession): Promise<FrdoRegistryBatch[]> =>
    apiRequest<FrdoRegistryBatch[]>('/frdo-registry/exports', withAuth(session)),

  getFrdoBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/frdo-registry/exports/${id}/file`, withAuth(session)),

  createEisotTestingExport: (
    session: UserSession,
    body: { from?: string; to?: string; groupId?: string; clientId?: string }
  ): Promise<EisotTestingExportOutcome> =>
    apiRequest<EisotTestingExportOutcome>('/eisot-testing-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listEisotTestingBatches: (session: UserSession): Promise<EisotTestingBatch[]> =>
    apiRequest<EisotTestingBatch[]>('/eisot-testing-registry/exports', withAuth(session)),

  getEisotTestingBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/eisot-testing-registry/exports/${id}/file`, withAuth(session)),

  createRostechnadzorExport: (
    session: UserSession,
    body: { groupId?: string; clientId?: string; enrolledFrom?: string; enrolledTo?: string }
  ): Promise<RostechnadzorExportOutcome> =>
    apiRequest<RostechnadzorExportOutcome>('/rostechnadzor-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listRostechnadzorBatches: (session: UserSession): Promise<RostechnadzorBatch[]> =>
    apiRequest<RostechnadzorBatch[]>('/rostechnadzor-registry/exports', withAuth(session)),

  getRostechnadzorBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/rostechnadzor-registry/exports/${id}/file`, withAuth(session)),

  createNmoExport: (
    session: UserSession,
    body: {
      from?: string;
      to?: string;
      types?: ('certificate' | 'diploma')[];
      groupId?: string;
      clientId?: string;
    }
  ): Promise<NmoExportOutcome> =>
    apiRequest<NmoExportOutcome>('/nmo-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listNmoBatches: (session: UserSession): Promise<NmoBatch[]> =>
    apiRequest<NmoBatch[]>('/nmo-registry/exports', withAuth(session)),

  getNmoBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/nmo-registry/exports/${id}/file`, withAuth(session))
};
