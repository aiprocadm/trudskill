import { describe, expect, it } from 'vitest';

import { identityLevelTwoAvailable, mayUploadIdentityImages, resolveConsents } from './consent.js';

describe('resolveConsents — раздельные согласия (ФТ-C3.2)', () => {
  it('пустая запись — согласий нет', () => {
    const r = resolveConsents({});
    expect(r.pii.granted).toBe(false);
    expect(r.photo.granted).toBe(false);
  });

  it('явные согласия читаются независимо', () => {
    const r = resolveConsents({
      piiConsentAt: '2026-07-01T10:00:00.000Z',
      photoConsentAt: '2026-07-01T10:00:05.000Z'
    });
    expect(r.pii.granted).toBe(true);
    expect(r.photo.granted).toBe(true);
    expect(r.pii.legacy).toBe(false);
  });

  it('можно согласиться на ПДн и отказаться от фото', () => {
    const r = resolveConsents({ piiConsentAt: '2026-07-01T10:00:00.000Z' });
    expect(r.pii.granted).toBe(true);
    expect(r.photo.granted).toBe(false);
    // Ключевой критерий приёмки: уровень 2 недоступен, и это видно явно.
    expect(identityLevelTwoAvailable(r)).toBe(false);
  });

  it('отзыв одного согласия НЕ отзывает другое', () => {
    const r = resolveConsents({
      piiConsentAt: '2026-07-01T10:00:00.000Z',
      photoConsentAt: '2026-07-01T10:00:00.000Z',
      photoConsentRevokedAt: '2026-07-05T10:00:00.000Z'
    });
    expect(r.photo.granted).toBe(false);
    expect(r.photo.revokedAt).toBe('2026-07-05T10:00:00.000Z');
    expect(r.pii.granted).toBe(true);
  });

  it('повторное согласие после отзыва снова действует', () => {
    // Человек, передумавший дважды, не должен оказаться заперт навсегда.
    const r = resolveConsents({
      photoConsentRevokedAt: '2026-07-05T10:00:00.000Z',
      photoConsentAt: '2026-07-09T10:00:00.000Z'
    });
    expect(r.photo.granted).toBe(true);
  });

  describe('перенос исторических записей', () => {
    it('старая общая галочка считается согласием на ПДн', () => {
      const r = resolveConsents({ consentAt: '2026-01-01T10:00:00.000Z' });
      expect(r.pii.granted).toBe(true);
      expect(r.pii.legacy).toBe(true);
    });

    it('согласие на фото засчитывается ТОЛЬКО при реально загруженном фото', () => {
      const withPhoto = resolveConsents({
        consentAt: '2026-01-01T10:00:00.000Z',
        selfieFileId: 'f_selfie'
      });
      expect(withPhoto.photo.granted).toBe(true);
      expect(withPhoto.photo.legacy).toBe(true);
    });

    it('старая галочка без фото НЕ даёт согласия на фото', () => {
      // Иначе мы задним числом «получили» согласие, которого человек не давал —
      // ровно тот дефект, ради устранения которого согласия и разделяют.
      const r = resolveConsents({ consentAt: '2026-01-01T10:00:00.000Z' });
      expect(r.photo.granted).toBe(false);
    });

    it('паспорт без селфи тоже считается загруженным фото', () => {
      const r = resolveConsents({
        consentAt: '2026-01-01T10:00:00.000Z',
        passportFileId: 'f_passport'
      });
      expect(r.photo.granted).toBe(true);
    });

    it('явное согласие важнее исторического и не помечается как legacy', () => {
      const r = resolveConsents({
        consentAt: '2026-01-01T10:00:00.000Z',
        piiConsentAt: '2026-07-01T10:00:00.000Z'
      });
      expect(r.pii.at).toBe('2026-07-01T10:00:00.000Z');
      expect(r.pii.legacy).toBe(false);
    });

    it('отзыв гасит и историческое согласие', () => {
      const r = resolveConsents({
        consentAt: '2026-01-01T10:00:00.000Z',
        piiConsentRevokedAt: '2026-07-01T10:00:00.000Z'
      });
      expect(r.pii.granted).toBe(false);
    });
  });
});

describe('mayUploadIdentityImages', () => {
  it('без согласия на фото загрузка недопустима', () => {
    expect(mayUploadIdentityImages(resolveConsents({ piiConsentAt: 'a' }))).toBe(false);
  });

  it('без согласия на ПДн фото тоже не принимаем', () => {
    // Фото само по себе — персональные данные; согласие на фото без согласия на
    // обработку данных не имеет смысла.
    expect(mayUploadIdentityImages(resolveConsents({ photoConsentAt: 'a' }))).toBe(false);
  });

  it('оба согласия — загрузка разрешена', () => {
    expect(
      mayUploadIdentityImages(resolveConsents({ piiConsentAt: 'a', photoConsentAt: 'a' }))
    ).toBe(true);
  });
});
