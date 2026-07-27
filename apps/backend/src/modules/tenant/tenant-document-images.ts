import type { TenantRequisites } from './tenant.types.js';

/**
 * Подпись руководителя и печать учебного центра (ФТ-A7.1, Фаза 1 Task 9).
 *
 * Живут в `payload` реквизитов тенанта (JSONB) — как и настройки нумераторов Task 6:
 * это конфигурация одного тенанта, отдельная таблица и миграция ей не нужны.
 * Юридический статус — факсимиле; юридически значимая подпись — это esign/НЭП (ЭПИК C).
 */

export const TENANT_DOCUMENT_IMAGES_KEY = 'documentImages';

/** Какие картинки центр может загрузить (совпадает с кодами каталога `tenant.*_image`). */
export const TENANT_IMAGE_SLOTS = ['signature', 'stamp'] as const;
export type TenantImageSlot = (typeof TENANT_IMAGE_SLOTS)[number];

export interface TenantDocumentImage {
  fileId: string;
  /** Ширина на бланке в миллиметрах; высота считается по пропорциям файла. */
  widthMm?: number;
}

export type TenantDocumentImages = Partial<Record<TenantImageSlot, TenantDocumentImage>>;

function isSlot(value: string): value is TenantImageSlot {
  return (TENANT_IMAGE_SLOTS as readonly string[]).includes(value);
}

/** Разбор `payload.documentImages` с отбраковкой мусора — payload правит и человек. */
export function readTenantDocumentImages(requisites?: TenantRequisites): TenantDocumentImages {
  const raw = requisites?.payload?.[TENANT_DOCUMENT_IMAGES_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const result: TenantDocumentImages = {};
  for (const [slot, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSlot(slot) || !value || typeof value !== 'object') continue;
    const { fileId, widthMm } = value as { fileId?: unknown; widthMm?: unknown };
    if (typeof fileId !== 'string' || !fileId) continue;
    result[slot] = {
      fileId,
      ...(typeof widthMm === 'number' && widthMm > 0 ? { widthMm } : {})
    };
  }
  return result;
}

/** fileId картинки слота или пустая строка — формат значения переменной каталога. */
export function tenantImageFileId(
  requisites: TenantRequisites | undefined,
  slot: TenantImageSlot
): string {
  return readTenantDocumentImages(requisites)[slot]?.fileId ?? '';
}
