/**
 * Пределы загрузки файлов, показываемые человеку (ТЗ 5.9 / Э9).
 *
 * Число живёт ОДНИМ местом на фронте и обязано совпадать с сервером
 * (`SUBMISSION_MAX_BYTES` в `apps/backend/src/modules/files/files.service.ts`): разойдись
 * они — экран пообещал бы 20 МБ, а ручка отказала бы на 12-м, и человек получил бы отказ
 * после долгой загрузки с телефона. Совпадение проверяет сторож `file-upload-is-human`.
 */
export const UPLOAD_MAX_SIZE_MB = 10;

/** Что принимают от слушателя как снимок лица: только фото. */
export const SELFIE_ACCEPT = 'image/png,image/jpeg';

/** Разворот паспорта — фото или скан. */
export const PASSPORT_ACCEPT = 'image/png,image/jpeg,application/pdf';

/**
 * Что принимают как файл практической работы. Список повторяет серверный
 * `SUBMISSION_MIME_ALLOWLIST`: экран не должен обещать формат, который ручка отвергнет.
 */
export const SUBMISSION_ACCEPT = 'application/pdf,image/png,image/jpeg,.doc,.docx,.xlsx';
