import type {
  ClientEditFormState,
  ClientListItem,
  ClientStatus,
  CreateClientPayload,
  UpdateClientPayload
} from './types';

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Активна',
  archived: 'В архиве'
};

/** Отображение ИНН без разделителей; «—» если пусто или невалидно. */
export function formatInn(inn: string | undefined): string {
  if (!inn) return '—';
  const digits = inn.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 12) return digits;
  return inn;
}

/** Телефон: нормализует +7-формат если 11 цифр; иначе оставляет как введено или «—». */
export function formatPhone(phone: string | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return phone;
}

/** 0..1 → «X из Y (Z%)». При total=0 — «0 из 0». */
export function formatProgressLabel(completed: number, total: number): string {
  if (total === 0) return '0 из 0';
  const percent = Math.round((completed / total) * 100);
  return `${completed} из ${total} (${percent}%)`;
}

/** Edit form → PATCH payload (null для очистки опциональных полей). */
export function buildClientUpdatePayload(form: ClientEditFormState): UpdateClientPayload {
  const nullable = (v: string): string | null => (v.trim() ? v.trim() : null);
  const required = (v: string): string => v.trim();
  return {
    code: required(form.code),
    name: required(form.name),
    legalName: nullable(form.legalName),
    inn: nullable(form.inn),
    kpp: nullable(form.kpp),
    contactEmail: nullable(form.contactEmail),
    contactPhone: nullable(form.contactPhone),
    legalAddress: nullable(form.legalAddress),
    note: nullable(form.note),
    status: form.status
  };
}

/** Edit form → POST payload (опциональные поля пропускаются если пусто). */
export function buildClientCreatePayload(form: ClientEditFormState): CreateClientPayload {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    ...(form.legalName.trim() ? { legalName: form.legalName.trim() } : {}),
    ...(form.inn.trim() ? { inn: form.inn.trim() } : {}),
    ...(form.kpp.trim() ? { kpp: form.kpp.trim() } : {}),
    ...(form.contactEmail.trim() ? { contactEmail: form.contactEmail.trim() } : {}),
    ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
    ...(form.legalAddress.trim() ? { legalAddress: form.legalAddress.trim() } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {})
  };
}

export function emptyClientForm(): ClientEditFormState {
  return {
    code: '',
    name: '',
    legalName: '',
    inn: '',
    kpp: '',
    contactEmail: '',
    contactPhone: '',
    legalAddress: '',
    note: '',
    status: 'active'
  };
}

export function toEditFormState(client: ClientListItem): ClientEditFormState {
  return {
    code: client.code,
    name: client.name,
    legalName: client.legalName ?? '',
    inn: client.inn ?? '',
    kpp: client.kpp ?? '',
    contactEmail: client.contactEmail ?? '',
    contactPhone: client.contactPhone ?? '',
    legalAddress: client.legalAddress ?? '',
    note: client.note ?? '',
    status: client.status
  };
}
