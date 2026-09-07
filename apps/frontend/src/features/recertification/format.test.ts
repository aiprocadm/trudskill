import { describe, expect, it } from 'vitest';

import { decisionNote, formatRemaining, formatSnils } from './format';
import { RECERT_STATUS_LABELS } from './types';

describe('formatRemaining', () => {
  it('future date → «через N дн.»', () => {
    expect(formatRemaining('2026-06-17', '2026-06-07')).toBe('через 10 дн.');
  });
  it('same date → «сегодня»', () => {
    expect(formatRemaining('2026-06-07', '2026-06-07')).toBe('сегодня');
  });
  it('past date → «просрочено N дн.»', () => {
    expect(formatRemaining('2026-06-01', '2026-06-07')).toBe('просрочено 6 дн.');
  });
  it('handles month boundary correctly', () => {
    expect(formatRemaining('2026-07-01', '2026-06-29')).toBe('через 2 дн.');
  });
  it('handles year boundary', () => {
    expect(formatRemaining('2027-01-01', '2026-12-31')).toBe('через 1 дн.');
  });
  it('returns «—» for malformed input', () => {
    expect(formatRemaining('not-a-date', '2026-06-07')).toBe('—');
  });
});

describe('formatSnils', () => {
  it('returns dash for undefined', () => {
    expect(formatSnils(undefined)).toBe('—');
  });
  it('masks raw digits', () => {
    expect(formatSnils('12345678901')).toBe('123-456-789 01');
  });
  it('passes through already-masked', () => {
    expect(formatSnils('123-456-789 01')).toBe('123-456-789 01');
  });
});

describe('RECERT_STATUS_LABELS', () => {
  it('has Russian labels for each status', () => {
    expect(RECERT_STATUS_LABELS.pending).toBe('Ожидает');
    expect(RECERT_STATUS_LABELS.approved).toBe('Одобрен');
    expect(RECERT_STATUS_LABELS.rejected).toBe('Отклонён');
  });
  /*
   * §5.431: у решённой записи видно, КТО и КОГДА решил.
   *
   * «Перезачислить» и «Убрать из очереди» — решения сотрудника центра о человеке, у которого
   * истекает удостоверение. Сервер хранил автора решения и присылал его, а экран не показывал
   * вовсе: кто убрал слушателя из очереди, выяснялось только по базе. Для регулируемого центра
   * это ровно тот вопрос, который задают при проверке.
   */
  describe('кто и когда решил (§5.431)', () => {
    it('называет человека и дату', () => {
      const note = decisionNote({
        decidedAt: '2026-09-02T08:30:00.000Z',
        decidedBy: 'user_admin',
        decidedByName: 'Сидорова А.'
      });

      expect(note).toContain('Сидорова А.');
      expect(note).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    });

    it('у нерешённой записи не пишет ничего', () => {
      expect(decisionNote({})).toBeNull();
    });

    it('удалённая учётная запись названа прямо, а не «системой»', () => {
      const note = decisionNote({ decidedAt: '2026-09-02T08:30:00.000Z', decidedBy: 'user_gone' });

      expect(note).toContain('учётная запись удалена');
      // И уж точно не сырой идентификатор (правило продукта №2).
      expect(note).not.toContain('user_gone');
    });
  });
});
