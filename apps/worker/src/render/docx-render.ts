import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

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

/** Рендер: DOCX-шаблон + словарь переменных → готовый DOCX (детерминированный). */
export function renderDocx(templateBuffer: Buffer, variables: Record<string, unknown>): Buffer {
  const doc = buildDoc(templateBuffer);
  try {
    doc.render(variables);
  } catch (error) {
    throw toTemplateRenderError(error);
  }
  const zip = doc.getZip() as PizZip;
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
  const doc = buildDoc(templateBuffer);
  const zip = doc.getZip() as PizZip;
  const parts = Object.keys(zip.files)
    .filter((name) => RENDERABLE_PARTS.test(name))
    .sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : 0));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const part of parts) {
    // getFullText склеивает текстовые узлы — тег, разбитый Word'ом на несколько
    // прогонов (runs), в склейке снова цел.
    const text = doc.getFullText(part);
    for (const match of text.matchAll(/\{([#^/]?)([^{}]+)\}/g)) {
      const marker = match[1];
      const name = match[2]!.trim();
      if (marker === '/' || !name) continue;
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push(name);
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
