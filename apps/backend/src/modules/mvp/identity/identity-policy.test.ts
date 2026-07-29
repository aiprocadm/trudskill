import { describe, expect, it } from 'vitest';

import {
  type IdentityPolicyRecord,
  normalizeLevel,
  requiresDocumentIdentity,
  requiresExamControl,
  requiresSimpleSignature,
  resolveIdentityPolicy
} from './identity-policy.js';

/**
 * Политика идентификации (ФТ-C1, Фаза 3 Task 1).
 * Здесь решается допуск к итоговому тесту — поэтому проверяем не «работает ли»,
 * а что политику нельзя случайно снять и нельзя случайно ужесточить.
 */

const rec = (
  scope: IdentityPolicyRecord['scope'],
  level: number,
  over: Partial<IdentityPolicyRecord> = {}
): IdentityPolicyRecord => ({ scope, level, ...over });

describe('resolveIdentityPolicy — побеждает самая узкая запись', () => {
  it('курс важнее направления и тенанта', () => {
    const policy = resolveIdentityPolicy([rec('tenant', 3), rec('direction', 2), rec('course', 1)]);
    expect(policy).toMatchObject({ level: 1, source: 'course' });
  });

  it('направление важнее тенанта, когда курс не задан', () => {
    const policy = resolveIdentityPolicy([rec('tenant', 3), rec('direction', 2)]);
    expect(policy).toMatchObject({ level: 2, source: 'direction' });
  });

  it('НЕ максимум уровней: ослабление на курсе применяется', () => {
    // Центр держит уровень 2, но конкретный ознакомительный курс поставил 0 —
    // иначе настройка курса не имела бы смысла.
    const policy = resolveIdentityPolicy([rec('tenant', 2), rec('course', 0)]);
    expect(policy.level).toBe(0);
  });

  it('ничего не задано — уровень 0, а не отказ', () => {
    expect(resolveIdentityPolicy([])).toEqual({
      level: 0,
      requirePhotoBeforeExam: false,
      source: 'default'
    });
  });

  it('пустые записи в списке не ломают вычисление', () => {
    const policy = resolveIdentityPolicy([null, undefined, rec('tenant', 2)]);
    expect(policy.level).toBe(2);
  });

  it('фото перед экзаменом берётся из победившей записи', () => {
    const policy = resolveIdentityPolicy([
      rec('tenant', 2, { requirePhotoBeforeExam: true }),
      rec('course', 2)
    ]);
    // Победил курс — значит и флаг берём с курса, а не подмешиваем чужой.
    expect(policy.requirePhotoBeforeExam).toBe(false);
  });
});

describe('normalizeLevel — мусор опускается до 0, а не поднимается до 3', () => {
  it('корректные уровни проходят', () => {
    expect([0, 1, 2, 3].map(normalizeLevel)).toEqual([0, 1, 2, 3]);
  });

  it('выход за границы и мусор дают 0', () => {
    // Поднять неизвестное значение до 3 значило бы молча запретить экзамен всей
    // группе из-за опечатки; опустить до 0 — видно и исправимо.
    for (const bad of [-1, 4, 99, Number.NaN, Number.POSITIVE_INFINITY, '2', null, {}]) {
      expect(normalizeLevel(bad)).toBe(0);
    }
  });

  it('дробный уровень обрезается, а не округляется вверх', () => {
    expect(normalizeLevel(2.9)).toBe(2);
  });

  it('мусорный уровень в записи не пролезает в результат', () => {
    expect(resolveIdentityPolicy([rec('tenant', 99)]).level).toBe(0);
  });
});

describe('что требует каждый уровень', () => {
  const at = (level: number) => resolveIdentityPolicy([rec('tenant', level)]);

  it('уровень 0 — только логин: ничего дополнительного не требуется', () => {
    expect(requiresSimpleSignature(at(0))).toBe(false);
    expect(requiresDocumentIdentity(at(0))).toBe(false);
    expect(requiresExamControl(at(0))).toBe(false);
  });

  it('уровень 1 — ПЭП', () => {
    expect(requiresSimpleSignature(at(1))).toBe(true);
    expect(requiresDocumentIdentity(at(1))).toBe(false);
  });

  it('уровень 2 — документ, и ПЭП тоже (уровни накопительные)', () => {
    expect(requiresSimpleSignature(at(2))).toBe(true);
    expect(requiresDocumentIdentity(at(2))).toBe(true);
    expect(requiresExamControl(at(2))).toBe(false);
  });

  it('уровень 3 — экзаменационный контроль поверх всего предыдущего', () => {
    expect(requiresSimpleSignature(at(3))).toBe(true);
    expect(requiresDocumentIdentity(at(3))).toBe(true);
    expect(requiresExamControl(at(3))).toBe(true);
  });
});
