import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export interface IssueGroupOrderRequest {
  groupId: string;
  templateId: string;
  enrollmentIds: string[];
  certificateTemplateId?: string;
}

export interface IssuedDocumentDto {
  id: string;
  documentNumber?: string;
  documentType: string;
  status: string;
  documentDate?: string;
  groupOrderDocumentId?: string;
}

export interface IssueGroupOrderResponse {
  order: IssuedDocumentDto;
  certificates: IssuedDocumentDto[];
  alreadyExisted: boolean;
}

export const groupOrdersApi = {
  issue: (session: UserSession, req: IssueGroupOrderRequest) =>
    apiRequest<IssueGroupOrderResponse>('/admin/documents/group-orders', {
      method: 'POST',
      body: req,
      ...withAuth(session)
    })
};
