import { describe, expect, it } from 'vitest';

import {
  ESIA_ACTOR_ID,
  ESIA_REVIEWER_LABEL,
  examDurationMinutes,
  resolveReviewerLabel,
  toSignedAction
} from './learner-dossier.js';

describe('examDurationMinutes (ФТ-C2)', () => {
  it('считает полные минуты между началом и концом', () => {
    expect(examDurationMinutes('2026-07-30T10:00:00.000Z', '2026-07-30T10:45:30.000Z')).toBe(45);
  });

  it('незавершённая сессия длительности НЕ имеет', () => {
    // «0 минут» означало бы, что человек мгновенно закончил, — это неправда.
    expect(examDurationMinutes('2026-07-30T10:00:00.000Z', undefined)).toBeUndefined();
  });

  it('отрицательная разница отбрасывается — часы сервера разъехались', () => {
    expect(
      examDurationMinutes('2026-07-30T10:00:00.000Z', '2026-07-30T09:00:00.000Z')
    ).toBeUndefined();
  });

  it('битые даты не превращаются в NaN-минуты', () => {
    expect(examDurationMinutes('вчера', '2026-07-30T10:00:00.000Z')).toBeUndefined();
    expect(examDurationMinutes('2026-07-30T10:00:00.000Z', 'сегодня')).toBeUndefined();
  });

  it('сессия меньше минуты — ноль, а не пусто: она ЗАВЕРШЕНА', () => {
    expect(examDurationMinutes('2026-07-30T10:00:00.000Z', '2026-07-30T10:00:30.000Z')).toBe(0);
  });
});

describe('resolveReviewerLabel (ФТ-C2)', () => {
  const users = async (id: string) => (id === 'u_mod' ? 'Петрова Анна' : undefined);

  it('живой модератор показывается по имени', async () => {
    await expect(resolveReviewerLabel('u_mod', users)).resolves.toBe('Петрова Анна');
  });

  it('ЕСИА помечается как автоматическое подтверждение', async () => {
    // У таких записей живого проверяющего не было — выдавать его за человека нельзя.
    await expect(resolveReviewerLabel(ESIA_ACTOR_ID, users)).resolves.toBe(ESIA_REVIEWER_LABEL);
  });

  it('неизвестный идентификатор показывается как есть', async () => {
    // «—» скрыло бы сам факт принятого решения, а он важен проверяющему.
    await expect(resolveReviewerLabel('u_deleted', users)).resolves.toBe('u_deleted');
  });

  it('сбой поиска пользователя не роняет дело', async () => {
    const broken = async () => {
      throw new Error('iam down');
    };
    await expect(resolveReviewerLabel('u_mod', broken)).resolves.toBe('u_mod');
  });

  it('без решения — пусто', async () => {
    await expect(resolveReviewerLabel(undefined, users)).resolves.toBeUndefined();
  });
});

describe('toSignedAction (ФТ-C2)', () => {
  it('вытаскивает чем подписано и откуда', () => {
    const action = toSignedAction({
      createdAt: '2026-07-30T10:00:00.000Z',
      eventType: 'esignature.action_signed',
      description: 'Ознакомлен с программой',
      payload: { signedWith: 'simple_electronic_signature', ip: '10.0.0.1' }
    });

    expect(action).toEqual({
      at: '2026-07-30T10:00:00.000Z',
      eventType: 'esignature.action_signed',
      description: 'Ознакомлен с программой',
      signedWith: 'simple_electronic_signature',
      ip: '10.0.0.1'
    });
  });

  it('нечисловой мусор в payload не попадает в дело', () => {
    const action = toSignedAction({
      createdAt: '2026-07-30T10:00:00.000Z',
      eventType: 'x',
      description: 'y',
      payload: { signedWith: 42, ip: { addr: '1.2.3.4' } }
    });

    expect(action).not.toHaveProperty('signedWith');
    expect(action).not.toHaveProperty('ip');
  });

  it('пустой payload не ломает разбор', () => {
    expect(() =>
      toSignedAction({ createdAt: 'a', eventType: 'b', description: 'c', payload: {} })
    ).not.toThrow();
  });
});
