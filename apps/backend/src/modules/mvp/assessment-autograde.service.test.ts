import { describe, expect, it } from 'vitest';

import { gradeAnswer, normalizeText } from './assessment-autograde.service.js';

import type { AnswerOption, AttemptAnswer, Question } from './mvp.types.js';

function q(partial: Partial<Question>): Question {
  return {
    id: 'q1',
    tenantId: 't',
    questionBankId: 'b',
    type: 'single_choice',
    title: 'Q',
    score: 2,
    isArchived: false,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now',
    ...partial
  };
}
function opt(id: string, isCorrect: boolean): AnswerOption {
  return {
    id,
    tenantId: 't',
    questionId: 'q1',
    text: id,
    isCorrect,
    sortOrder: 0,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now'
  };
}
function ans(partial: Partial<AttemptAnswer>): AttemptAnswer {
  return {
    id: 'a1',
    tenantId: 't',
    attemptId: 'at1',
    questionId: 'q1',
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now',
    ...partial
  };
}

describe('normalizeText', () => {
  it('trims, lowercases and collapses internal whitespace', () => {
    expect(normalizeText('  Москва  Сити ')).toBe('москва сити');
  });
});

describe('gradeAnswer — single_choice', () => {
  const options = [opt('o1', true), opt('o2', false)];
  it('awards full score for the correct option', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'single_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o1'] })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a wrong option', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'single_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o2'] })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('awards 0 and stays auto-graded when unanswered', () => {
    expect(
      gradeAnswer({ question: q({ type: 'single_choice' }), options, answer: undefined })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('abstains (autoGraded:false) when no correct option is configured', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'single_choice' }),
        options: [opt('o1', false)],
        answer: ans({ selectedOptionIds: ['o1'] })
      })
    ).toEqual({ score: 0, autoGraded: false });
  });
});

describe('gradeAnswer — multiple_choice (binary: all-correct-and-only)', () => {
  const options = [opt('o1', true), opt('o2', true), opt('o3', false)];
  it('awards full score only when the exact correct set is chosen', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'multiple_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o2', 'o1'] })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a partial set (no partial credit in V1)', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'multiple_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o1'] })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('awards 0 when an extra wrong option is included', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'multiple_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o1', 'o2', 'o3'] })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
});

describe('gradeAnswer — number_input (absolute tolerance)', () => {
  it('awards full score within tolerance', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 3.14, numericTolerance: 0.01 }),
        options: [],
        answer: ans({ textAnswer: '3.15' })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 outside tolerance', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 3.14, numericTolerance: 0.01 }),
        options: [],
        answer: ans({ textAnswer: '3.2' })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('treats missing tolerance as exact match', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 10 }),
        options: [],
        answer: ans({ textAnswer: '10' })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a non-numeric answer', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 10 }),
        options: [],
        answer: ans({ textAnswer: 'ten' })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('abstains when numericExpected is not configured', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input' }),
        options: [],
        answer: ans({ textAnswer: '1' })
      })
    ).toEqual({ score: 0, autoGraded: false });
  });
});

describe('gradeAnswer — text (normalized exact match)', () => {
  it('awards full score for a case/whitespace-insensitive match', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'text', expectedAnswer: 'Москва' }),
        options: [],
        answer: ans({ textAnswer: '  москва ' })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a mismatch', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'text', expectedAnswer: 'Москва' }),
        options: [],
        answer: ans({ textAnswer: 'Питер' })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('abstains when expectedAnswer is not configured', () => {
    expect(
      gradeAnswer({ question: q({ type: 'text' }), options: [], answer: ans({ textAnswer: 'x' }) })
    ).toEqual({ score: 0, autoGraded: false });
  });
});

describe('gradeAnswer — essay (never auto-graded)', () => {
  it('always abstains', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'essay' }),
        options: [],
        answer: ans({ textAnswer: 'long answer' })
      })
    ).toEqual({ score: 0, autoGraded: false });
  });
});
