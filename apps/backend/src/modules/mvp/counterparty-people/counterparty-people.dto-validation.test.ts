import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  BulkCounterpartyEmployeesRequest,
  CreateCounterpartyContactRequest,
  ListCounterpartyEmployeesQuery,
  UpdateCounterpartyEmployeeRequest
} from './counterparty-people.dto.js';

const errorsOf = (cls: new () => object, raw: unknown): string[] =>
  validateSync(plainToInstance(cls, raw), { whitelist: true, forbidNonWhitelisted: true }).map(
    (e) => e.property
  );

describe('тела запросов людей компании (МГ-D2.1, срез 14.1)', () => {
  it('пачка сотрудников: кривая почта и пустое имя проходят форму — их поимённо разберёт служба', () => {
    expect(
      errorsOf(BulkCounterpartyEmployeesRequest, {
        rows: [{ lastName: 'Орлов', email: 'не-почта' }, { firstName: 'Игорь' }]
      })
    ).toEqual([]);
    expect(errorsOf(BulkCounterpartyEmployeesRequest, { rows: [] })).toEqual(['rows']);
  });

  it('одиночный контакт с кривой почтой или без имени — отказ формы', () => {
    expect(errorsOf(CreateCounterpartyContactRequest, { firstName: 'Анна', email: 'x' })).toEqual([
      'email'
    ]);
    expect(errorsOf(CreateCounterpartyContactRequest, {})).toEqual(['firstName']);
  });

  it('правка сотрудника: null очищает, статус — из списка, страница — не больше 200', () => {
    expect(
      errorsOf(UpdateCounterpartyEmployeeRequest, {
        middleName: null,
        learnerId: null,
        status: 'dismissed'
      })
    ).toEqual([]);
    expect(errorsOf(UpdateCounterpartyEmployeeRequest, { status: 'fired' })).toEqual(['status']);
    expect(errorsOf(ListCounterpartyEmployeesQuery, { page_size: '500' })).toEqual(['page_size']);
    expect(errorsOf(ListCounterpartyEmployeesQuery, { page: '2', q: 'ива' })).toEqual([]);
  });
});
