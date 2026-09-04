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

  it('неправильный код (без объекта или с тремя частями) читается целой фразой', () => {
    // Журнал 346: `auth.login` — самая частая строка живого журнала — показывалась кодом.
    expect(describeAction('auth.login')).toBe('Вход в систему');
    expect(describeAction('auth.refresh')).toBe('Сеанс продлён');
    expect(describeAction('learner.personal_data_accessed')).toBe(
      'Персональные данные слушателя просмотрены'
    );
    expect(describeAction('documents.task.retried')).toBe('Задача выпуска документа перезапущена');
    expect(describeAction('documents.number.released')).toBe('Номер документа освобождён');
  });

  it('глагол не повторяет объект: «итог подведён», а не «итог подведён итог»', () => {
    expect(describeAction('assessment.exam_result_finalized')).toBe('Итог экзамена утверждён');
    expect(describeAction('documents.finalized')).toBe('Документ утверждён');
  });

  it('код без объекта в разделе «Документы» — про документ', () => {
    expect(describeAction('documents.signed')).toBe('Документ подписан');
    expect(describeAction('documents.downloaded')).toBe('Документ скачан');
  });

  it('один и тот же объект в разных разделах называется по-своему', () => {
    // «Шаблон» отчётов — не шаблон документа: без учёта раздела фраза врала.
    expect(describeAction('reports.template_created')).toBe('Шаблон отчёта заведён');
    expect(describeAction('documents.template_created')).toBe('Шаблон документа заведён');
    expect(entityLabel('reports.template')).toBe('Шаблон отчёта');
    expect(entityLabel('documents.template')).toBe('Шаблон документа');
  });

  it('новые объекты и глаголы согласованы по роду', () => {
    expect(describeAction('learning.commission_member_added')).toBe('Член комиссии добавлен');
    expect(describeAction('learning.identity_verification_rejected')).toBe(
      'Проверка личности отклонена'
    );
    expect(describeAction('documents.numbering_rule_activated')).toBe('Правило нумерации включено');
  });

  it('тип объекта с префиксом раздела и без него подписан по-русски', () => {
    // Бэкенд пишет тип объекта с разделом (`learning.group`), обёртки — без (`document_task`).
    expect(entityLabel('learning.group')).toBe('Учебная группа');
    expect(entityLabel('iam.user')).toBe('Пользователь');
    expect(entityLabel('mvp.learner')).toBe('Слушатель');
    expect(entityLabel('document_task')).toBe('Задача выпуска документа');
    expect(entityLabel('tenant')).toBe('Учебный центр');
  });

  it('разделы, которые пишет бэкенд, подписаны по-русски', () => {
    expect(domainLabel('platform.tenant_created')).toBe('Платформа');
    expect(domainLabel('learner.personal_data_accessed')).toBe('Персональные данные');
    expect(domainLabel('storage.file_deleted')).toBe('Файлы');
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
