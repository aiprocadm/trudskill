import { describe, expect, it } from 'vitest';

import { buildCommitPayload, buildInitialCmi, parseScormSessionTime } from './cmi-mapping';

describe('parseScormSessionTime', () => {
  it.each([
    ['00:00:30', 30],
    ['01:02:03', 3723],
    ['0000:05:00.99', 300],
    ['', 0],
    ['garbage', 0]
  ])('%s → %d сек', (input, expected) => {
    expect(parseScormSessionTime(input)).toBe(expected);
  });
});

describe('buildCommitPayload', () => {
  it('переносит lesson_status/location/suspend_data/score и session_time в секунды', () => {
    const payload = buildCommitPayload({
      core: {
        lesson_status: 'passed',
        lesson_location: 'page-7',
        session_time: '00:10:00',
        score: { raw: '85', max: '100', min: '0' }
      },
      suspend_data: 'state-blob'
    });
    expect(payload).toEqual({
      lessonStatus: 'passed',
      lessonLocation: 'page-7',
      suspendData: 'state-blob',
      scoreRaw: 85,
      scoreMax: 100,
      scoreMin: 0,
      sessionSeconds: 600
    });
  });
  it('опускает пустые/нечисловые поля (exactOptionalPropertyTypes: НЕ undefined-ключи)', () => {
    const payload = buildCommitPayload({ core: { lesson_status: 'incomplete', session_time: '' } });
    expect(payload).toEqual({ lessonStatus: 'incomplete', sessionSeconds: 0 });
    expect('scoreRaw' in payload).toBe(false);
  });
});

describe('buildInitialCmi', () => {
  it('строит JSON для Scorm12API.loadFromJSON из attempt + ученика', () => {
    expect(
      buildInitialCmi(
        {
          id: 'sca_1',
          enrollmentId: 'enr_1',
          materialId: 'mat_1',
          lessonStatus: 'incomplete',
          lessonLocation: 'page-3',
          suspendData: 'blob',
          scoreRaw: 40,
          totalSeconds: 120,
          startedAt: '2026-06-12T00:00:00Z'
        },
        { studentId: 'lrn_1', studentName: 'Иванов Иван' }
      )
    ).toEqual({
      core: {
        student_id: 'lrn_1',
        student_name: 'Иванов Иван',
        lesson_location: 'page-3',
        lesson_status: 'incomplete',
        score: { raw: 40 }
      },
      suspend_data: 'blob'
    });
  });
});
