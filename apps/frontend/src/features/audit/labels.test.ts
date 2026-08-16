import { describe, expect, it } from 'vitest';

import { describeAction, domainLabel, entityLabel } from './labels';

describe('подписи журнала действий (TXT-006)', () => {
  it('код действия превращается в человеческую фразу', () => {
    expect(describeAction('learning.learner_created')).toBe('Слушатель заведён');
    expect(describeAction('assessment.attempt_started')).toBe('Попытка теста начата');
    expect(describeAction('documents.document_revoked')).toBe('Документ аннулирован');
  });

  it('составной объект разбирается целиком, а не по первому слову', () => {
    // `question_bank_created`: объект — «банк вопросов», а не «вопрос».
    expect(describeAction('assessment.question_bank_created')).toBe('Банк вопросов заведён');
  });

  it('незнакомый код показывается как есть — сведения не теряются', () => {
    expect(describeAction('какой_то.новый_код')).toBe('какой_то.новый_код');
    expect(describeAction('без-точки')).toBe('без-точки');
  });

  it('раздел подписан по-русски', () => {
    expect(domainLabel('assessment.attempt_started')).toBe('Оценивание');
    expect(domainLabel('неизвестный.код')).toBe('неизвестный');
  });

  it('тип объекта подписан по-русски и с большой буквы', () => {
    expect(entityLabel('group')).toBe('Учебная группа');
    expect(entityLabel('невиданный')).toBe('невиданный');
  });

  it('глагол согласован с родом объекта', () => {
    // Без согласования получалось «Попытка теста начат» и «Комиссия заведён».
    expect(describeAction('assessment.attempt_started')).toBe('Попытка теста начата');
    expect(describeAction('learning.commission_created')).toBe('Комиссия заведена');
    expect(describeAction('learning.enrollment_created')).toBe('Зачисление заведено');
  });

  it('в готовых фразах нет латиницы и подчёркиваний', () => {
    const phrases = [
      describeAction('learning.enrollment_created'),
      describeAction('iam.role_updated'),
      entityLabel('learner')
    ];
    expect(phrases.filter((phrase) => /[A-Za-z_]/.test(phrase))).toEqual([]);
  });
});
