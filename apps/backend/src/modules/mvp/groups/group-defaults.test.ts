import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GROUP_DEFAULTS,
  groupCreationSettingsFrom,
  resolveGroupCodePattern,
  resolveGroupDefaults
} from './group-defaults.js';

/** МГ-B1.1: значения по умолчанию из настроек центра; непонятное — значение по умолчанию. */
describe('настройки группы центра (МГ-B1.1)', () => {
  it('пустые настройки — умолчания', () => {
    expect(resolveGroupDefaults(undefined)).toEqual(DEFAULT_GROUP_DEFAULTS);
    expect(resolveGroupDefaults('мусор')).toEqual(DEFAULT_GROUP_DEFAULTS);
  });

  it('допустимые значения принимаются, недопустимые — заменяются умолчанием, числа ограничены', () => {
    const resolved = resolveGroupDefaults({
      studyForm: 'in_person',
      isDot: false,
      accessMode: 'always_open',
      enrollmentMode: 'нет такого',
      remoteSignature: 'true',
      requireIdentity: true,
      examAccessWindow: 'exam_day',
      notifyOnPass: { email: false },
      periodDays: 9999
    });
    expect(resolved).toEqual({
      studyForm: 'in_person',
      isDot: false,
      accessMode: 'always_open',
      enrollmentMode: 'auto',
      remoteSignature: false,
      requireIdentity: true,
      examAccessWindow: 'exam_day',
      notifyOnPass: { email: false, inApp: true },
      periodDays: 730
    });
  });

  it('шаблон кода — только с известными токенами', () => {
    expect(resolveGroupCodePattern('{YYYY}-{NNN}')).toBe('{YYYY}-{NNN}');
    expect(resolveGroupCodePattern('{XX}')).toBe('{YY}{WW}{NN}');
    expect(
      groupCreationSettingsFrom({ groupCodePattern: 'G-{YY}{NN}', groupDefaults: { isDot: false } })
    ).toEqual({
      codePattern: 'G-{YY}{NN}',
      defaults: { ...DEFAULT_GROUP_DEFAULTS, isDot: false }
    });
  });
});
