import { describe, expect, it } from 'vitest';

import {
  cdoprofContragentSchema,
  cdoprofListEnvelope,
  cdoprofStudentSchema,
  cdoprofTrainingsEnvelopeSchema
} from './cdoprof-api.schemas.js';

const pagination = { page: 1, limit: 100, total: 1, pages: 1, has_prev: false, has_next: false };

describe('cdoprof-api.schemas', () => {
  it('принимает конверт списка и пропускает неизвестные поля контрагента', () => {
    const parsed = cdoprofListEnvelope(cdoprofContragentSchema).parse({
      success: true,
      data: {
        items: [{ id: 1, inn: '7700000001', name_organiztion: 'ООО «Тест»', new_field: 'x' }],
        pagination
      }
    });

    expect(parsed.data.items[0]?.id).toBe(1);
    expect((parsed.data.items[0] as Record<string, unknown>).new_field).toBe('x');
    expect(parsed.data.pagination.total).toBe(1);
  });

  it('поля сущности могут отсутствовать или быть null', () => {
    const parsed = cdoprofListEnvelope(cdoprofStudentSchema).parse({
      data: { items: [{ id: 7, surname: null }], pagination }
    });

    expect(parsed.data.items[0]?.surname).toBeNull();
    expect(parsed.data.items[0]?.full_name).toBeUndefined();
  });

  it('нормализует обучения: объект → массив из одного элемента', () => {
    const parsed = cdoprofTrainingsEnvelopeSchema.parse({
      success: true,
      data: {
        contragent: { id: 1 },
        items: {
          student: { id: 5 },
          trainings: {
            course: { id: 9 },
            group: { id: 3 },
            result: { code: 1, result_rus: 'сдал' }
          }
        }
      }
    });

    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.items[0]?.trainings).toHaveLength(1);
    expect(parsed.data.items[0]?.trainings[0]?.result?.result_rus).toBe('сдал');
  });

  it('нормализует обучения: массивы остаются массивами, пустое → []', () => {
    const parsed = cdoprofTrainingsEnvelopeSchema.parse({
      data: {
        contragent: { id: 1 },
        items: [
          { student: { id: 5 }, trainings: [{ course: { id: 9 } }, { course: { id: 10 } }] },
          { student: { id: 6 }, trainings: null }
        ]
      }
    });

    expect(parsed.data.items[0]?.trainings).toHaveLength(2);
    expect(parsed.data.items[1]?.trainings).toEqual([]);
  });

  it('отвергает конверт без items', () => {
    expect(() =>
      cdoprofListEnvelope(cdoprofContragentSchema).parse({ success: true, data: {} })
    ).toThrow();
  });

  it('отвергает элемент без числового id', () => {
    expect(() =>
      cdoprofListEnvelope(cdoprofContragentSchema).parse({
        data: { items: [{ id: 'abc' }], pagination }
      })
    ).toThrow();
  });
});
