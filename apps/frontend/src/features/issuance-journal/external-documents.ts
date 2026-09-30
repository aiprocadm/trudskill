import { apiRequest } from '../../lib/api/client';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';

/** МГ-F4.1 (срез 22.2): внешний документ — выданный раньше в CDOPROF или на бумаге. */
export interface ExternalDocumentInput {
  kindCode: string;
  number: string;
  date: string;
  learnerId: string;
  series?: string;
  rank?: string;
  validUntil?: string;
  fileId?: string;
}

export interface ExternalScanIntent {
  fileId: string;
  uploadUrl: string;
}

export const externalDocumentsApi = {
  registerExternalDocument: (session: UserSession, input: ExternalDocumentInput) =>
    apiRequest<{ id: string; documentNumber: string }>('/documents/external', {
      method: 'POST',
      body: { ...input, sourceSystem: 'manual' },
      ...withAuth(session)
    }),
  externalScanUploadUrl: (
    session: UserSession,
    file: { name: string; type: string; size: number }
  ) =>
    apiRequest<ExternalScanIntent>('/documents/external/upload-url', {
      method: 'POST',
      body: { originalName: file.name, contentType: file.type, sizeBytes: file.size },
      ...withAuth(session)
    }),
  attachExternalScan: (session: UserSession, documentId: string, fileId: string) =>
    apiRequest<{ id: string }>(`/documents/external/${encodeURIComponent(documentId)}/scan`, {
      method: 'POST',
      body: { fileId },
      ...withAuth(session)
    })
};

/** Сканы — PDF и фотографии бланка (как на сервере). */
export const EXTERNAL_SCAN_ACCEPT = 'application/pdf,image/png,image/jpeg';

/** Чего не хватает форме — словами для подсказки у кнопки; пусто — можно вносить. */
export const externalFormBlocked = (form: {
  kindCode: string;
  number: string;
  date: string;
  learnerId: string;
}): string | undefined => {
  if (!form.kindCode) return 'Выберите вид документа';
  if (!form.number.trim()) return 'Укажите номер документа';
  if (!form.date) return 'Укажите дату выдачи';
  if (!form.learnerId) return 'Выберите слушателя';
  return undefined;
};

/** Вид документа в книге выдачи: название вида, у внешнего — с пометкой. */
export const journalKindView = (
  doc: { kindCode?: string; isExternal?: boolean },
  typeLabel: string,
  kindName: (code: string) => string | undefined
): string => {
  const name = (doc.kindCode ? kindName(doc.kindCode) : undefined) ?? typeLabel;
  return doc.isExternal ? `${name} (внешний)` : name;
};
