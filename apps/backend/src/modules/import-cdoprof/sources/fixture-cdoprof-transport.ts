/**
 * Транспорт к API CDOPROF на обезличенных фикстурах.
 *
 * Живых данных CDOPROF у агента нет (🚫 О1), поэтому весь код выгрузки и импорта проверяется на
 * наборе из `__fixtures__/cdoprof-api/dataset.json`. Транспорт воспроизводит поведение сервера
 * ровно настолько, насколько его описывает `docs/audit/cdoprof-openapi-v1.yaml`: постраничная
 * выдача с `pagination`, поиск подстрокой, фильтры по контрагенту. Чего в описании нет (лимиты
 * частоты, форматы дат) — не выдумывается: это вопросы живого прогона.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CdoprofApiError } from './cdoprof-transport.js';

import type { CdoprofQuery, CdoprofTransport } from './cdoprof-transport.js';

type Row = Record<string, unknown>;

export interface CdoprofDataset {
  contragents: Row[];
  students: Row[];
  parentCourses: Row[];
  courses: Row[];
  groups: Row[];
  /** Ключ — id контрагента строкой (как в JSON). */
  trainings: Record<string, Row[]>;
}

const DATASET_URL = new URL('../__fixtures__/cdoprof-api/dataset.json', import.meta.url);

export const loadFixtureDataset = (): CdoprofDataset => {
  const raw = JSON.parse(readFileSync(fileURLToPath(DATASET_URL), 'utf8')) as CdoprofDataset & {
    $comment?: string;
  };
  return {
    contragents: raw.contragents,
    students: raw.students,
    parentCourses: raw.parentCourses,
    courses: raw.courses,
    groups: raw.groups,
    trainings: raw.trainings
  };
};

const toInt = (value: string | number | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
};

const matches = (row: Row, needle: string, columns?: string[]): boolean => {
  const haystack = columns ?? Object.keys(row);
  const lower = needle.toLowerCase();
  return haystack.some((key) => {
    const value = row[key];
    return value !== null && value !== undefined && String(value).toLowerCase().includes(lower);
  });
};

export class FixtureCdoprofTransport implements CdoprofTransport {
  readonly calls: Array<{ method: string; query: CdoprofQuery }> = [];

  constructor(private readonly dataset: CdoprofDataset = loadFixtureDataset()) {}

  async get(method: string, query: CdoprofQuery = {}): Promise<unknown> {
    this.calls.push({ method, query });
    switch (method) {
      case 'contragent.get':
        return this.page(
          this.search(this.dataset.contragents, query, ['name_organiztion', 'inn', 'email']),
          query
        );
      case 'contragent.byInn':
        return this.page(
          this.dataset.contragents.filter(
            (row) => String(row.inn ?? '') === String(query.inn ?? '')
          ),
          query
        );
      case 'contragent.students': {
        const orgId = Number(query.contragent_id);
        let rows = this.dataset.students.filter((row) => row.id_organiz === orgId);
        if (query.student_id !== undefined) {
          rows = rows.filter((row) => row.id === Number(query.student_id));
        }
        return this.page(rows, query);
      }
      case 'student.get':
        return this.page(this.search(this.dataset.students, query), query);
      case 'course.get':
        return this.page(this.search(this.dataset.courses, query), query);
      case 'course.parent.get':
        return this.page(this.search(this.dataset.parentCourses, query), query);
      case 'group.get':
        return this.page(this.search(this.dataset.groups, query), query);
      case 'contragent.students.trainings': {
        const orgId = String(query.contragent_id ?? '');
        const contragent = this.dataset.contragents.find((row) => String(row.id) === orgId);
        if (!contragent) {
          return { success: false, message: `contragent ${orgId} not found` };
        }
        const items = this.dataset.trainings[orgId] ?? [];
        return {
          success: true,
          data: {
            contragent,
            items,
            pagination: { page: 1, limit: items.length, total: items.length, pages: 1 }
          }
        };
      }
      default:
        throw new CdoprofApiError('unknown_method', `Фикстуры не знают метода ${method}`);
    }
  }

  private search(rows: Row[], query: CdoprofQuery, defaultColumns?: string[]): Row[] {
    const needle = query.search === undefined ? '' : String(query.search).trim();
    if (!needle) return rows;
    const column = query.search_column === undefined ? undefined : String(query.search_column);
    const columns = column ? [column] : defaultColumns;
    return rows.filter((row) => matches(row, needle, columns));
  }

  private page(rows: Row[], query: CdoprofQuery) {
    const limit = Math.min(toInt(query.limit, 20), 100);
    const page = toInt(query.page, 1);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    return {
      success: true,
      data: {
        items: rows.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total,
          pages,
          has_prev: page > 1,
          has_next: page < pages
        }
      }
    };
  }
}
