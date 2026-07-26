/**
 * Движок рендера DOCX-бланков (ЭПИК A) — общий для `apps/worker` (фоновая выдача
 * документов) и `apps/backend` (разбор плейсхолдеров и предпросмотр в админке).
 *
 * Вынесен из воркера в Task 5: копия в двух приложениях неизбежно разошлась бы,
 * а бланк обязан рендериться одинаково и при выдаче, и в предпросмотре.
 */
export { TemplateRenderError, extractPlaceholders, renderDocx } from './docx-render.js';
export { DocumentConversionError, convertDocxToPdf } from './gotenberg-convert.js';
export type { GotenbergDeps } from './gotenberg-convert.js';
/** Тестовые хелперы: собирают валидный DOCX кодом — вместо бинарных фикстур в git. */
export { buildDocx, p, readDocumentXml, splitRunsP } from './docx-fixture.js';
