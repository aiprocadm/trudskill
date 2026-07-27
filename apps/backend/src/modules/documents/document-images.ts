import { imageVariableCodes } from './variable-catalog.js';
import { readTenantDocumentImages } from '../tenant/tenant-document-images.js';

import type { TenantRequisites } from '../tenant/tenant.types.js';

/**
 * Отбор картинок для рендера бланка (ФТ-A7.1, Фаза 1 Task 9).
 *
 * Значение переменной-картинки в словаре — fileId (так он попадает и в снапшот ФТ-A1.4,
 * поэтому перевыпуск берёт ровно ту же подпись). Здесь из словаря вынимаются непустые
 * fileId, а вызывающий код превращает их в presigned-ссылки для worker'а.
 */

/**
 * Ширина по умолчанию, мм. Без неё картинка встала бы в натуральную величину — скан
 * подписи 600 px занял бы половину листа. Значения — привычный размер факсимиле.
 */
const DEFAULT_WIDTH_MM: Readonly<Record<string, number>> = {
  'tenant.signature_image': 40,
  'tenant.stamp_image': 35,
  'commission.chairman.signature_file_id': 35,
  'commission.secretary.signature_file_id': 35
};

const FALLBACK_WIDTH_MM = 35;

export interface DocumentImageRef {
  /** Имя переменной каталога, оно же имя тега `{%…}` в бланке. */
  name: string;
  fileId: string;
  widthMm: number;
}

/** Ширина слота из настроек тенанта, если админ её переопределил. */
function tenantWidthOverride(code: string, requisites?: TenantRequisites): number | undefined {
  const images = readTenantDocumentImages(requisites);
  if (code === 'tenant.signature_image') return images.signature?.widthMm;
  if (code === 'tenant.stamp_image') return images.stamp?.widthMm;
  return undefined;
}

/** Переменные-картинки с заполненным fileId — то, что реально надо скачать для рендера. */
export function collectDocumentImageRefs(
  variables: Record<string, unknown>,
  requisites?: TenantRequisites
): DocumentImageRef[] {
  const refs: DocumentImageRef[] = [];
  for (const code of imageVariableCodes()) {
    const fileId = variables[code];
    if (typeof fileId !== 'string' || !fileId) continue;
    refs.push({
      name: code,
      fileId,
      widthMm: tenantWidthOverride(code, requisites) ?? DEFAULT_WIDTH_MM[code] ?? FALLBACK_WIDTH_MM
    });
  }
  return refs;
}
