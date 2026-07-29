import { describe, expect, it } from 'vitest';

import { hashConsentBody, isConsentKind, resolveConsentState } from './consent.js';

describe('resolveConsentState (ФТ-C3.2)', () => {
  const doc = { version: 2, bodyHash: 'hash-v2' };

  it('без факта согласие не действует — молчание не согласие', () => {
    const state = resolveConsentState('photo', doc, null);
    expect(state.granted).toBe(false);
    expect(state.hasDocument).toBe(true);
  });

  it('данное и не отозванное согласие действует', () => {
    const state = resolveConsentState('photo', doc, {
      grantedAt: '2026-01-01T00:00:00.000Z',
      bodyHash: 'hash-v2'
    });
    expect(state.granted).toBe(true);
    expect(state.grantedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(state.renewalRecommended).toBe(false);
  });

  it('отозванное согласие не действует, но момент выдачи остаётся видимым', () => {
    const state = resolveConsentState('personal_data', doc, {
      grantedAt: '2026-01-01T00:00:00.000Z',
      revokedAt: '2026-02-01T00:00:00.000Z',
      bodyHash: 'hash-v2'
    });
    expect(state.granted).toBe(false);
    expect(state.revokedAt).toBe('2026-02-01T00:00:00.000Z');
    // Отозванное согласие — доказательство законности обработки в прошлом, а не мусор.
    expect(state.grantedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('изменение текста не снимает согласие, а только просит переподписать', () => {
    // Иначе правка опечатки отозвала бы согласия у всего центра разом.
    const state = resolveConsentState('photo', doc, {
      grantedAt: '2026-01-01T00:00:00.000Z',
      bodyHash: 'hash-v1'
    });
    expect(state.granted).toBe(true);
    expect(state.renewalRecommended).toBe(true);
  });

  it('историческое согласие без хэша текста не считается устаревшим', () => {
    // Перенесённые миграцией 0069 согласия текста не имели — сравнивать не с чем.
    const state = resolveConsentState('personal_data', doc, {
      grantedAt: '2025-06-01T00:00:00.000Z'
    });
    expect(state.granted).toBe(true);
    expect(state.renewalRecommended).toBe(false);
  });

  it('без опубликованного текста согласие всё равно может действовать', () => {
    const state = resolveConsentState('photo', null, { grantedAt: '2026-01-01T00:00:00.000Z' });
    expect(state.granted).toBe(true);
    expect(state.hasDocument).toBe(false);
  });
});

describe('вид согласия', () => {
  it('знает ровно два вида', () => {
    expect(isConsentKind('personal_data')).toBe(true);
    expect(isConsentKind('photo')).toBe(true);
    expect(isConsentKind('biometrics')).toBe(false);
    expect(isConsentKind(undefined)).toBe(false);
  });
});

describe('hashConsentBody', () => {
  it('игнорирует перевод строк и хвостовые пробелы — Word не должен плодить версии', () => {
    expect(hashConsentBody('Текст\r\nвторая строка  ')).toBe(hashConsentBody('Текст\nвторая строка'));
  });

  it('различает содержательно разные тексты', () => {
    expect(hashConsentBody('Согласен на фото')).not.toBe(hashConsentBody('Согласен на видео'));
  });
});
