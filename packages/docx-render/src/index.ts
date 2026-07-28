/**
 * Движок рендера DOCX-бланков (ЭПИК A) — общий для `apps/worker` (фоновая выдача
 * документов) и `apps/backend` (разбор плейсхолдеров и предпросмотр в админке).
 *
 * Вынесен из воркера в Task 5: копия в двух приложениях неизбежно разошлась бы,
 * а бланк обязан рендериться одинаково и при выдаче, и в предпросмотре.
 */
export {
  IMAGE_TAG_PREFIX,
  TemplateRenderError,
  extractPlaceholders,
  extractTemplateTags,
  renderDocx
} from './docx-render.js';
export type { RenderDocxOptions, TemplateTag } from './docx-render.js';
/** Картинки в бланке (ФТ-A7.1): подпись руководителя и печать учебного центра. */
export { DocxImageError, detectImageContentType } from './docx-image.js';
export type { DocxImage } from './docx-image.js';
export { DocumentConversionError, convertDocxToPdf } from './gotenberg-convert.js';
export type { GotenbergDeps } from './gotenberg-convert.js';
/** Тестовые хелперы: собирают валидный DOCX кодом — вместо бинарных фикстур в git. */
export { buildDocx, p, readDocumentXml, splitRunsP, tinyPng } from './docx-fixture.js';
