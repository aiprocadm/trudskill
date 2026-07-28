import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import {
  DocxImageError,
  IMAGE_MARKER_PREFIX,
  IMAGE_MARKER_SUFFIX,
  embedImages
} from './docx-image.js';

import type { DocxImage } from './docx-image.js';

/**
 * Движок рендера DOCX-шаблонов (ФТ-A1.2/A2, Фаза 1 Task 1).
 *
 * Синтаксис — как в ТЗ: одиночные теги `{learner.full_name}`, циклы
 * `{#group_learners}…{/group_learners}` (таблица протокола), условия
 * `{#flag}…{/flag}` / инверсия `{^flag}…{/flag}`. Разделители — фигурные скобки.
 *
 * Значения ищутся сначала по ПЛОСКОМУ ключу с точками (`variables['learner.full_name']` —
 * ровно такой словарь отдают резолверы pillar-a-variables), затем по вложенному пути —
 * поэтому внутри цикла по массиву объектов работают короткие теги `{full_name}`.
 * Неизвестный резолвером тег рендерится пустой строкой (nullGetter), как в e-mail шаблонах.
 */

/** Ошибка шаблона (не транспорта): битые/несбалансированные теги. Не ретраится. */
export class TemplateRenderError extends Error {
  constructor(readonly problems: string[]) {
    super(`Template render failed: ${problems.join('; ')}`);
    this.name = 'TemplateRenderError';
  }
}

/**
 * Фиксированная дата зип-записей — детерминизм (ФТ-A1.4): повторный рендер тех же
 * данных обязан давать байт-в-байт тот же файл, иначе «повторная выдача» недоказуема.
 */
const FIXED_ZIP_DATE = new Date('2000-01-01T00:00:00.000Z');

const RENDERABLE_PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;

/** Префикс тега-картинки в бланке: `{%tenant.stamp_image}` (ФТ-A7.1). */
export const IMAGE_TAG_PREFIX = '%';

function lookupPath(scope: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, scope);
}

function buildDoc(templateBuffer: Buffer): Docxtemplater {
  try {
    const zip = new PizZip(templateBuffer);
    return new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
      parser: (tag: string) => ({
        get: (scope: unknown) => {
          if (tag === '.') return scope;
          // Тег-картинка `{%tenant.stamp_image}` (ФТ-A7.1): в текст кладём маркер, который
          // после рендера заменяется настоящим изображением (см. docx-image.ts).
          if (tag.startsWith(IMAGE_TAG_PREFIX)) {
            const name = tag.slice(IMAGE_TAG_PREFIX.length).trim();
            return `${IMAGE_MARKER_PREFIX}${name}${IMAGE_MARKER_SUFFIX}`;
          }
          if (scope != null && typeof scope === 'object' && tag in (scope as object)) {
            return (scope as Record<string, unknown>)[tag];
          }
          return lookupPath(scope, tag);
        }
      })
    });
  } catch (error) {
    throw toTemplateRenderError(error);
  }
}

export interface RenderDocxOptions {
  /**
   * Картинки под именами переменных (ФТ-A7.1): `{ 'tenant.stamp_image': {...} }`.
   * Переменная без картинки просто исчезает из бланка — документ выдаётся без печати,
   * а не падает: у центра может быть не загружено ни подписи, ни печати.
   */
  images?: Record<string, DocxImage>;
}

/** Рендер: DOCX-шаблон + словарь переменных → готовый DOCX (детерминированный). */
export function renderDocx(
  templateBuffer: Buffer,
  variables: Record<string, unknown>,
  options: RenderDocxOptions = {}
): Buffer {
  const doc = buildDoc(templateBuffer);
  try {
    doc.render(variables);
  } catch (error) {
    throw toTemplateRenderError(error);
  }
  const zip = doc.getZip() as PizZip;
  try {
    embedImages(zip, options.images ?? {});
  } catch (error) {
    // Битая картинка — дефект данных бланка, а не транспорта: терминальная ошибка с
    // человекочитаемым текстом для админа (ФТ-A1.5).
    if (error instanceof DocxImageError) throw new TemplateRenderError([error.message]);
    throw error;
  }
  for (const entry of Object.values(zip.files)) {
    (entry as { options: { date: Date } }).options.date = FIXED_ZIP_DATE;
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Список тегов шаблона в порядке появления (тело + колонтитулы) — для таблицы
 * «найдено/соответствует каталогу/неизвестно» админ-UX (ФТ-A3.2). Открывающие маркеры
 * циклов/условий (`#`, `^`) считаются тегом, закрывающие (`/`) — нет.
 */
export function extractPlaceholders(templateBuffer: Buffer): string[] {
  return extractTemplateTags(templateBuffer).map((tag) => tag.name);
}

/** Тег бланка вместе с его ролью: обычная подстановка или картинка (`{%…}`, ФТ-A7.1). */
export interface TemplateTag {
  name: string;
  kind: 'value' | 'image';
}

/** То же, что `extractPlaceholders`, но с ролью тега — для админ-UX (ФТ-A3.2). */
export function extractTemplateTags(templateBuffer: Buffer): TemplateTag[] {
  const doc = buildDoc(templateBuffer);
  const zip = doc.getZip() as PizZip;
  const parts = Object.keys(zip.files)
    .filter((name) => RENDERABLE_PARTS.test(name))
    .sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : 0));
  const seen = new Set<string>();
  const ordered: TemplateTag[] = [];
  for (const part of parts) {
    // getFullText склеивает текстовые узлы — тег, разбитый Word'ом на несколько
    // прогонов (runs), в склейке снова цел.
    const text = doc.getFullText(part);
    for (const match of text.matchAll(/\{([#^/%]?)([^{}]+)\}/g)) {
      const marker = match[1];
      const name = match[2]!.trim();
      if (marker === '/' || !name) continue;
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push({ name, kind: marker === IMAGE_TAG_PREFIX ? 'image' : 'value' });
      }
    }
  }
  return ordered;
}

interface DocxtemplaterErrorShape {
  message?: string;
  properties?: {
    explanation?: string;
    errors?: Array<{ properties?: { explanation?: string }; message?: string }>;
  };
}

function toTemplateRenderError(error: unknown): TemplateRenderError {
  const shaped = error as DocxtemplaterErrorShape;
  const problems: string[] = [];
  for (const inner of shaped.properties?.errors ?? []) {
    problems.push(inner.properties?.explanation ?? inner.message ?? 'unknown template error');
  }
  if (!problems.length) {
    problems.push(shaped.properties?.explanation ?? shaped.message ?? String(error));
  }
  return new TemplateRenderError(problems);
}
