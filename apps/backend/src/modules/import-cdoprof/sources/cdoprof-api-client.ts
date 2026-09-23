/**
 * Клиент API CDOPROF v1 — только чтение (ТЗ §13.1, I.1.10: «только GET, `api_key` в query,
 * страницы ≤100»).
 *
 * Методы один в один повторяют ручки источника, итераторы `iterate*` прячут постраничный обход.
 * Итератор останавливается по ЛЮБОМУ из трёх признаков: `has_next === false`, пустая страница,
 * `page >= pages`. Одного `has_next` мало: описание API — тестового сервера, и если живой
 * вернёт `has_next: true` на последней странице, выгрузка на 24 756 групп ушла бы в бесконечный
 * цикл.
 */
import {
  cdoprofContragentSchema,
  cdoprofCourseSchema,
  cdoprofGroupSchema,
  cdoprofListEnvelope,
  cdoprofParentCourseSchema,
  cdoprofStudentSchema,
  cdoprofTrainingsEnvelopeSchema
} from './cdoprof-api.schemas.js';

import type {
  CdoprofContragent,
  CdoprofCourse,
  CdoprofGroup,
  CdoprofListPage,
  CdoprofParentCourse,
  CdoprofStudent,
  CdoprofTrainingsResponse
} from './cdoprof-api.schemas.js';
import type { CdoprofQuery, CdoprofTransport } from './cdoprof-transport.js';
import type { z } from 'zod';

export interface CdoprofApiClientOptions {
  /** Размер страницы; у источника потолок 100. По умолчанию 100. */
  pageLimit?: number;
}

export interface CdoprofSearch {
  search?: string;
  searchColumn?: string;
}

const MAX_PAGE_LIMIT = 100;

export class CdoprofApiClient {
  private readonly pageLimit: number;

  constructor(
    private readonly transport: CdoprofTransport,
    options: CdoprofApiClientOptions = {}
  ) {
    this.pageLimit = Math.min(Math.max(1, options.pageLimit ?? MAX_PAGE_LIMIT), MAX_PAGE_LIMIT);
  }

  listContragents(page: number, search?: string): Promise<CdoprofListPage<CdoprofContragent>> {
    return this.fetchPage('contragent.get', cdoprofContragentSchema, page, { search });
  }

  getContragentByInn(inn: string): Promise<CdoprofListPage<CdoprofContragent>> {
    return this.fetchPage('contragent.byInn', cdoprofContragentSchema, 1, { inn });
  }

  listContragentStudents(
    contragentId: number,
    page: number,
    studentId?: number
  ): Promise<CdoprofListPage<CdoprofStudent>> {
    return this.fetchPage('contragent.students', cdoprofStudentSchema, page, {
      contragent_id: contragentId,
      student_id: studentId
    });
  }

  listStudents(page: number, search: CdoprofSearch = {}): Promise<CdoprofListPage<CdoprofStudent>> {
    return this.fetchPage('student.get', cdoprofStudentSchema, page, searchQuery(search));
  }

  listCourses(page: number, search: CdoprofSearch = {}): Promise<CdoprofListPage<CdoprofCourse>> {
    return this.fetchPage('course.get', cdoprofCourseSchema, page, searchQuery(search));
  }

  listParentCourses(
    page: number,
    search: CdoprofSearch = {}
  ): Promise<CdoprofListPage<CdoprofParentCourse>> {
    return this.fetchPage(
      'course.parent.get',
      cdoprofParentCourseSchema,
      page,
      searchQuery(search)
    );
  }

  listGroups(page: number, search: CdoprofSearch = {}): Promise<CdoprofListPage<CdoprofGroup>> {
    return this.fetchPage('group.get', cdoprofGroupSchema, page, searchQuery(search));
  }

  async getContragentTrainings(contragentId: number): Promise<CdoprofTrainingsResponse> {
    const raw = await this.transport.get('contragent.students.trainings', {
      contragent_id: contragentId
    });
    return cdoprofTrainingsEnvelopeSchema.parse(raw).data;
  }

  iterateContragents(search?: string): AsyncGenerator<CdoprofContragent> {
    return this.iterate((page) => this.listContragents(page, search));
  }

  iterateContragentStudents(contragentId: number): AsyncGenerator<CdoprofStudent> {
    return this.iterate((page) => this.listContragentStudents(contragentId, page));
  }

  iterateStudents(search?: CdoprofSearch): AsyncGenerator<CdoprofStudent> {
    return this.iterate((page) => this.listStudents(page, search));
  }

  iterateCourses(search?: CdoprofSearch): AsyncGenerator<CdoprofCourse> {
    return this.iterate((page) => this.listCourses(page, search));
  }

  iterateParentCourses(search?: CdoprofSearch): AsyncGenerator<CdoprofParentCourse> {
    return this.iterate((page) => this.listParentCourses(page, search));
  }

  iterateGroups(search?: CdoprofSearch): AsyncGenerator<CdoprofGroup> {
    return this.iterate((page) => this.listGroups(page, search));
  }

  private async fetchPage<T extends z.ZodTypeAny>(
    method: string,
    itemSchema: T,
    page: number,
    extra: CdoprofQuery
  ): Promise<CdoprofListPage<z.infer<T>>> {
    const raw = await this.transport.get(method, { page, limit: this.pageLimit, ...extra });
    const parsed = cdoprofListEnvelope(itemSchema).parse(raw);
    return { items: parsed.data.items as z.infer<T>[], pagination: parsed.data.pagination };
  }

  private async *iterate<T>(
    loadPage: (page: number) => Promise<CdoprofListPage<T>>
  ): AsyncGenerator<T> {
    let page = 1;
    for (;;) {
      const { items, pagination } = await loadPage(page);
      for (const item of items) yield item;
      if (items.length === 0) return;
      if (pagination.has_next === false) return;
      if (page >= pagination.pages) return;
      page += 1;
    }
  }
}

const searchQuery = (search: CdoprofSearch): CdoprofQuery => ({
  search: search.search,
  search_column: search.searchColumn
});
