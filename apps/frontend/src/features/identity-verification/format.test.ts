import { describe, expect, it } from 'vitest';

import {
  IDENTITY_STATUS_LABELS,
  fileUnavailableLabel,
  formatDateShort,
  formatIdentityStatus,
  formatWaitingTime,
  isWaitingTooLong
} from './format';

describe('IDENTITY_STATUS_LABELS', () => {
  it('has Russian label for draft', () => {
    expect(IDENTITY_STATUS_LABELS.draft).toBe('Черновик');
  });
  it('has Russian label for pending', () => {
    expect(IDENTITY_STATUS_LABELS.pending).toBe('На проверке');
  });
  it('has Russian label for approved', () => {
    expect(IDENTITY_STATUS_LABELS.approved).toBe('Подтверждена');
  });
  it('has Russian label for rejected', () => {
    expect(IDENTITY_STATUS_LABELS.rejected).toBe('Отклонена');
  });
});

describe('formatIdentityStatus', () => {
  it('returns mapped label for known status', () => {
    expect(formatIdentityStatus('pending')).toBe('На проверке');
    expect(formatIdentityStatus('approved')).toBe('Подтверждена');
  });
  it('passes through unknown status unchanged', () => {
    expect(formatIdentityStatus('unknown_status')).toBe('unknown_status');
  });
});

describe('formatDateShort', () => {
  it('returns «—» for undefined', () => {
    expect(formatDateShort(undefined)).toBe('—');
  });
  it('returns «—» for invalid date string', () => {
    expect(formatDateShort('not-a-date')).toBe('—');
  });
  it('returns non-dash string for valid ISO date', () => {
    const result = formatDateShort('2026-06-15T00:00:00.000Z');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });
  it('returns non-dash string for YYYY-MM-DD format', () => {
    const result = formatDateShort('2026-01-01');
    expect(result).not.toBe('—');
  });
});

describe('fileUnavailableLabel', () => {
  it('returns AV label for file_infected', () => {
    expect(fileUnavailableLabel('file_infected')).toBe('файл недоступен (антивирус)');
  });
  it('returns AV label for file_scan_failed', () => {
    expect(fileUnavailableLabel('file_scan_failed')).toBe('файл недоступен (антивирус)');
  });
  it('returns generic label for file_not_found', () => {
    expect(fileUnavailableLabel('file_not_found')).toBe('файл недоступен');
  });
  it('returns generic label for undefined', () => {
    expect(fileUnavailableLabel(undefined)).toBe('файл недоступен');
  });
  it('returns generic label for unknown codes', () => {
    expect(fileUnavailableLabel('file_error')).toBe('файл недоступен');
  });
});

/** Срок ожидания заявки (ФТ-C1.2, Фаза 3 Task 4). */
describe('formatWaitingTime', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');

  it('показывает срок, а не дату подачи — модератору важно «сколько ждёт»', () => {
    expect(formatWaitingTime('2026-07-28T11:30:00.000Z', now)).toBe('30 мин');
    expect(formatWaitingTime('2026-07-28T09:00:00.000Z', now)).toBe('3 ч');
    expect(formatWaitingTime('2026-07-25T12:00:00.000Z', now)).toBe('3 дн');
  });

  it('только что поданная заявка не показывается как «0 мин»', () => {
    expect(formatWaitingTime('2026-07-28T11:59:40.000Z', now)).toBe('только что');
  });

  it('расхождение часов сервера и клиента не даёт отрицательный срок', () => {
    // Иначе модератор решит, что данные битые, и перестанет доверять очереди.
    expect(formatWaitingTime('2026-07-28T12:05:00.000Z', now)).toBe('только что');
  });

  it('без даты подачи и на битой дате — прочерк', () => {
    expect(formatWaitingTime(undefined, now)).toBe('—');
    expect(formatWaitingTime('не дата', now)).toBe('—');
  });
});

describe('isWaitingTooLong', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');

  it('дольше суток — в первую очередь', () => {
    expect(isWaitingTooLong('2026-07-27T11:00:00.000Z', now)).toBe(true);
  });

  it('меньше суток — обычная очередь', () => {
    expect(isWaitingTooLong('2026-07-28T09:00:00.000Z', now)).toBe(false);
  });

  it('без даты подачи признак не срабатывает', () => {
    expect(isWaitingTooLong(undefined, now)).toBe(false);
  });
});
