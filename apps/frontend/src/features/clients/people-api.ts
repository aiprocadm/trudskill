import { apiRequest } from '../../lib/api/client';

import type {
  ClientContact,
  ClientEmployee,
  ClientEmployeesFilters,
  ClientEmployeesPage,
  ContactPayload,
  EmployeePayload,
  EmployeesBulkOutcome,
  EmployeesBulkRowInput,
  RepresentativeInviteOutcome
} from './people-types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

const base = (counterpartyId: string): string =>
  `/counterparties/${encodeURIComponent(counterpartyId)}`;

/** МГ-D2.1 (срез 14.2): контакты и сотрудники компании. */
export const clientPeopleApi = {
  listContacts: (
    session: UserSession,
    counterpartyId: string
  ): Promise<{ items: ClientContact[] }> =>
    apiRequest<{ items: ClientContact[] }>(`${base(counterpartyId)}/contacts`, {
      method: 'GET',
      ...withAuth(session)
    }),

  createContact: (
    session: UserSession,
    counterpartyId: string,
    payload: ContactPayload
  ): Promise<ClientContact> =>
    apiRequest<ClientContact>(`${base(counterpartyId)}/contacts`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  updateContact: (
    session: UserSession,
    counterpartyId: string,
    contactId: string,
    payload: ContactPayload
  ): Promise<ClientContact> =>
    apiRequest<ClientContact>(`${base(counterpartyId)}/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),

  /** МГ-D2.1 (срез 14.3): контакт — представителем в портал заказчика, письмо входа. */
  inviteContact: (
    session: UserSession,
    counterpartyId: string,
    contactId: string
  ): Promise<RepresentativeInviteOutcome> =>
    apiRequest<RepresentativeInviteOutcome>(
      `${base(counterpartyId)}/contacts/${encodeURIComponent(contactId)}/invite`,
      { method: 'POST', ...withAuth(session) }
    ),

  listEmployees: (
    session: UserSession,
    counterpartyId: string,
    filters: ClientEmployeesFilters
  ): Promise<ClientEmployeesPage> => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.page !== undefined) params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params.set('page_size', String(filters.pageSize));
    const qs = params.toString();
    return apiRequest<ClientEmployeesPage>(
      `${base(counterpartyId)}/employees${qs ? `?${qs}` : ''}`,
      { method: 'GET', ...withAuth(session) }
    );
  },

  createEmployee: (
    session: UserSession,
    counterpartyId: string,
    payload: EmployeePayload
  ): Promise<ClientEmployee> =>
    apiRequest<ClientEmployee>(`${base(counterpartyId)}/employees`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  updateEmployee: (
    session: UserSession,
    counterpartyId: string,
    employeeId: string,
    payload: EmployeePayload
  ): Promise<ClientEmployee> =>
    apiRequest<ClientEmployee>(
      `${base(counterpartyId)}/employees/${encodeURIComponent(employeeId)}`,
      { method: 'PATCH', body: payload, ...withAuth(session) }
    ),

  bulkEmployees: (
    session: UserSession,
    counterpartyId: string,
    rows: EmployeesBulkRowInput[]
  ): Promise<EmployeesBulkOutcome> =>
    apiRequest<EmployeesBulkOutcome>(`${base(counterpartyId)}/employees/bulk`, {
      method: 'POST',
      body: { rows },
      ...withAuth(session)
    })
};
