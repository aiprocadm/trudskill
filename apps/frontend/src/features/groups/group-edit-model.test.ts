import { describe, expect, it } from 'vitest';

import { groupEditDiff, groupEditErrors, groupEditFormOf } from './group-edit-model';

import type { Group } from '../mvp/types';

/** Дровер правки группы (МГ-B4.1, РМ69): в запрос уходит только разница, замок — зеркало сервера. */
const group = {
  id: 'g1',
  tenantId: 't',
  status: 'in_progress',
  createdAt: '',
  updatedAt: '',
  code: 'ОТ-1',
  name: 'Охрана труда',
  counterpartyId: 'cp1',
  comment: 'по договору',
  startDate: '2026-10-01',
  endDate: '2026-10-15',
  examDate: '2026-10-15',
  studyForm: 'distance',
  isDot: true
} as Group;

describe('groupEditFormOf', () => {
  it('раскладывает группу в строки формы; отсутствующее — пустая строка, ДОТ — тремя состояниями', () => {
    expect(groupEditFormOf(group)).toEqual({
      name: 'Охрана труда',
      code: 'ОТ-1',
      counterpartyId: 'cp1',
      comment: 'по договору',
      learnerMessage: '',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
      examDate: '2026-10-15',
      studyForm: 'distance',
      isDot: 'yes'
    });
    expect(
      groupEditFormOf({ ...group, isDot: undefined, studyForm: undefined } as unknown as Group)
    ).toMatchObject({
      isDot: '',
      studyForm: ''
    });
  });
});

describe('groupEditDiff', () => {
  const initial = groupEditFormOf(group);

  it('неизменённая форма — пустая разница', () => {
    expect(groupEditDiff(initial, { ...initial }, false)).toEqual({});
  });

  it('очищенное поле уходит как null, изменённое — значением; неизменённое не уходит', () => {
    const form = { ...initial, examDate: '', comment: 'новый', name: 'Охрана труда, октябрь' };
    expect(groupEditDiff(initial, form, false)).toEqual({
      name: 'Охрана труда, октябрь',
      comment: 'новый',
      examDate: null
    });
  });

  it('у закрытой группы даты, код и компания не уходят даже из изменённой формы; комментарий уходит', () => {
    const form = {
      ...initial,
      code: 'ОТ-2',
      counterpartyId: '',
      startDate: '2026-11-01',
      comment: 'итог',
      studyForm: 'blended',
      isDot: 'no' as const
    };
    expect(groupEditDiff(initial, form, true)).toEqual({
      comment: 'итог',
      studyForm: 'blended',
      isDot: false
    });
    expect(groupEditDiff(initial, form, false)).toMatchObject({
      code: 'ОТ-2',
      counterpartyId: null,
      startDate: '2026-11-01'
    });
  });
});

describe('groupEditErrors', () => {
  it('название ≥ 3, код ≥ 2 (или пусто), даты в порядке — как в мастере', () => {
    const initial = groupEditFormOf(group);
    expect(groupEditErrors(initial)).toEqual({});
    expect(groupEditErrors({ ...initial, name: 'ОТ' })).toMatchObject({ name: expect.any(String) });
    expect(groupEditErrors({ ...initial, code: 'x' })).toMatchObject({ code: expect.any(String) });
    expect(groupEditErrors({ ...initial, endDate: '2026-09-01' })).toMatchObject({
      endDate: expect.any(String)
    });
    expect(groupEditErrors({ ...initial, examDate: '2026-09-01' })).toMatchObject({
      examDate: expect.any(String)
    });
  });
});
