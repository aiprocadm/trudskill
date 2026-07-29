import { describe, expect, it } from 'vitest';

import { buildReadinessReport } from './registry-readiness.js';

const issue = (learnerId: string, fullName: string, field: string, message: string) => ({
  learnerId,
  fullName,
  field,
  message
});

describe('buildReadinessReport — поимённый список пробелов (ФТ-C4.1)', () => {
  it('пустой список ошибок = выгрузка готова', () => {
    const report = buildReadinessReport([]);
    expect(report.ready).toBe(true);
    expect(report.blockedLearners).toBe(0);
    expect(report.learners).toEqual([]);
  });

  it('одна ошибка блокирует выгрузку и называет человека поимённо', () => {
    const report = buildReadinessReport([
      issue('l1', 'Иванов Иван Иванович', 'snils', 'СНИЛС не заполнен')
    ]);

    expect(report.ready).toBe(false);
    expect(report.blockedLearners).toBe(1);
    expect(report.learners[0]).toEqual({
      learnerId: 'l1',
      fullName: 'Иванов Иван Иванович',
      problems: [{ field: 'snils', message: 'СНИЛС не заполнен' }]
    });
  });

  it('несколько пробелов у одного человека — одна запись со списком', () => {
    const report = buildReadinessReport([
      issue('l1', 'Иванов Иван', 'snils', 'СНИЛС не заполнен'),
      issue('l1', 'Иванов Иван', 'dateOfBirth', 'Дата рождения не заполнена')
    ]);

    expect(report.blockedLearners).toBe(1);
    expect(report.learners[0]!.problems).toHaveLength(2);
  });

  it('одинаковая проблема из двух документов не дублируется', () => {
    // Человек с двумя удостоверениями и одним незаполненным СНИЛСом должен увидеть
    // одну строку, а не две одинаковых.
    const report = buildReadinessReport([
      issue('l1', 'Иванов Иван', 'snils', 'СНИЛС не заполнен'),
      issue('l1', 'Иванов Иван', 'snils', 'СНИЛС не заполнен')
    ]);

    expect(report.learners[0]!.problems).toHaveLength(1);
  });

  it('разные люди считаются по головам, а не по ошибкам', () => {
    const report = buildReadinessReport([
      issue('l1', 'Иванов Иван', 'snils', 'нет СНИЛС'),
      issue('l1', 'Иванов Иван', 'dateOfBirth', 'нет даты рождения'),
      issue('l2', 'Петрова Анна', 'snils', 'нет СНИЛС')
    ]);

    expect(report.blockedLearners).toBe(2);
  });

  it('список отсортирован по ФИО — методист ищет глазами', () => {
    const report = buildReadinessReport([
      issue('l2', 'Яковлев Пётр', 'snils', 'нет СНИЛС'),
      issue('l1', 'Абрамов Иван', 'snils', 'нет СНИЛС')
    ]);

    expect(report.learners.map((l) => l.fullName)).toEqual(['Абрамов Иван', 'Яковлев Пётр']);
  });

  it('ФИО подхватывается из той строки, где оно заполнено', () => {
    const report = buildReadinessReport([
      issue('l1', '', 'document', 'Не удалось собрать документ'),
      issue('l1', 'Иванов Иван', 'snils', 'нет СНИЛС')
    ]);

    expect(report.learners[0]!.fullName).toBe('Иванов Иван');
  });

  it('строки без слушателя не теряются — их тоже надо разобрать', () => {
    const report = buildReadinessReport([issue('', '', 'document', 'Битая связь документа')]);

    expect(report.blockedLearners).toBe(1);
    expect(report.learners[0]!.fullName).toBe('—');
  });
});
