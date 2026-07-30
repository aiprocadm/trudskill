import { describe, expect, it } from 'vitest';

import { escapeHtml, formatMoment, renderDossierHtml } from './learner-dossier.html.js';

import type { LearnerDossier } from './learner-dossier.js';

const base: LearnerDossier = {
  learner: { id: 'lrn_1', fullName: 'Иванов Иван Иванович', snils: '112-233-445 95' },
  identity: { status: 'approved', method: 'selfie_passport', reviewedBy: 'Петрова Анна' },
  exams: [],
  documents: [],
  signedActions: [],
  unavailableSections: [],
  generatedAt: '2026-07-30T12:00:00.000Z'
};

describe('escapeHtml', () => {
  it('экранирует ввод людей — в деле есть ФИО и причины отклонения', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('не ломает обычный русский текст', () => {
    expect(escapeHtml('Иванов Иван')).toBe('Иванов Иван');
  });
});

describe('formatMoment', () => {
  it('даёт человеческую дату вместо ISO', () => {
    expect(formatMoment('2026-07-30T09:05:00.000Z')).toBe('30.07.2026 09:05');
  });

  it('пусто — прочерк', () => {
    expect(formatMoment(undefined)).toBe('—');
  });

  it('битую дату показывает как есть, а не «Invalid Date»', () => {
    expect(formatMoment('вчера')).toBe('вчера');
  });
});

describe('renderDossierHtml (ФТ-C2)', () => {
  it('содержит все четыре раздела', () => {
    const html = renderDossierHtml(base);
    for (const title of [
      'Подтверждение личности',
      'Экзаменационные сессии',
      'Выданные документы',
      'Подписанные действия'
    ]) {
      expect(html).toContain(title);
    }
  });

  it('пустые разделы объясняются словами, а не пустой таблицей', () => {
    const html = renderDossierHtml(base);
    expect(html).toContain('Экзаменационных сессий нет');
    expect(html).toContain('Документы не выдавались');
    expect(html).toContain('Подписанных действий нет');
  });

  it('НЕПРОЧИТАННЫЙ раздел подписей помечается предупреждением', () => {
    // «Подписей не было» и «мы не смогли их прочитать» — разные утверждения.
    const html = renderDossierHtml({ ...base, unavailableSections: ['signedActions'] });
    expect(html).toContain('Раздел недоступен');
    expect(html).toContain('НЕ означает');
    expect(html).not.toContain('Подписанных действий нет');
  });

  it('удаление снимков по сроку хранения названо прямо', () => {
    const html = renderDossierHtml({
      ...base,
      identity: { ...base.identity, imagesPurgedAt: '2026-10-20T10:00:00.000Z' }
    });
    expect(html).toContain('Снимки удалены по сроку хранения');
  });

  it('отзыв документа виден рядом со статусом', () => {
    const html = renderDossierHtml({
      ...base,
      documents: [
        {
          id: 'gd_1',
          documentType: 'certificate',
          status: 'revoked',
          revokedAt: '2026-08-01T10:00:00.000Z'
        }
      ]
    });
    expect(html).toContain('отозван 01.08.2026');
  });

  it('незавершённая сессия — «не завершено», а не «0 мин»', () => {
    const html = renderDossierHtml({
      ...base,
      exams: [{ attemptId: 'a1', testTitle: 'Тест', startedAt: '2026-07-30T10:00:00.000Z' }]
    });
    expect(html).toContain('не завершено');
  });

  it('ФИО с угловыми скобками не ломает разметку', () => {
    const html = renderDossierHtml({
      ...base,
      learner: { id: 'l', fullName: '<b>Иванов</b>' }
    });
    expect(html).toContain('&lt;b&gt;Иванов&lt;/b&gt;');
    expect(html).not.toContain('<b>Иванов</b>');
  });

  it('не тянет внешние ресурсы — страница должна рендериться без сети', () => {
    const html = renderDossierHtml(base);
    expect(html).not.toMatch(/<script|src="http|@import|<link/i);
  });
});
