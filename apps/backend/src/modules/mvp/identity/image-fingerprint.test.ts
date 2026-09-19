import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { collectFingerprints, fingerprintStream } from './image-fingerprint.js';
import {
  DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS,
  MAX_IDENTITY_IMAGE_RETENTION_DAYS,
  MIN_IDENTITY_IMAGE_RETENTION_DAYS,
  isValidRetentionDays
} from '../../tenant/tenant-identity-settings.js';

/**
 * Срок хранения снимков проверки личности (ТЗ 17.2, **решение владельца Р17**).
 *
 * **Что говорит Р17 дословно.** Файлы проверки личности (селфи, фото паспорта) хранятся
 * 90 дней после выдачи документа, затем удаляются автоматически; остаётся протокол
 * верификации — кто, когда и с каким результатом проверил, **плюс хеш файла**. Срок
 * настраивается центром **в пределах 30–365 дней**.
 *
 * **Что нашлось (журнал 578).** Механизм удаления работал, срок настраивался, факт удаления
 * писался в журнал. Но:
 *
 * 1. **Границы настройки стояли 1–1095 дней** вместо 30–365, то есть настройка позволяла обе
 *    крайности, против которых Р17 и написан: сутки (снимок исчезает назавтра, оспорить отказ
 *    нечем) и три года (то самое «вечное хранилище паспортных сканов»).
 * 2. **Хеша файла не было вовсе.** Протокол оставался недоказуемым: через год, когда файлов
 *    нет, подтвердить, что модератор смотрел именно тот документ, нечем.
 */

const here = dirname(fileURLToPath(import.meta.url));
const scanner = readFileSync(resolve(here, 'identity-retention-scanner.service.ts'), 'utf8');

describe('срок хранения — ровно тот, что назвал владелец (Р17)', () => {
  it('нижняя граница — месяц, а не сутки', () => {
    /*
     * Сутки означали бы: снимок исчезает назавтра после решения модератора. Если слушатель
     * оспорит отказ — а это первое, что он делает, — показать будет нечего ни ему, ни
     * проверяющему.
     */
    expect(MIN_IDENTITY_IMAGE_RETENTION_DAYS).toBe(30);
  });

  it('верхняя граница — год, а не три', () => {
    /*
     * Три года — это ровно то «вечное хранилище паспортных сканов», которое Р17 называет
     * главным риском при утечке и прямым нарушением принципа минимизации по 152-ФЗ.
     */
    expect(MAX_IDENTITY_IMAGE_RETENTION_DAYS).toBe(365);
  });

  it('по умолчанию — 90 дней и они внутри границ', () => {
    expect(DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS).toBe(90);
    expect(isValidRetentionDays(DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS)).toBe(true);
  });

  it('значения за границами отвергаются', () => {
    expect(isValidRetentionDays(1), 'сутки').toBe(false);
    expect(isValidRetentionDays(29), 'чуть меньше месяца').toBe(false);
    expect(isValidRetentionDays(366), 'чуть больше года').toBe(false);
    expect(isValidRetentionDays(1095), 'три года').toBe(false);
  });

  it('крайние допустимые значения принимаются', () => {
    expect(isValidRetentionDays(30)).toBe(true);
    expect(isValidRetentionDays(365)).toBe(true);
  });
});

describe('отпечаток удаляемого снимка (Р17: «плюс хеш файла»)', () => {
  it('совпадает у одинаковых файлов и различается у разных', () => {
    /* В этом и весь смысл: сличить можно, увидеть — нельзя. */
    const bytes = Buffer.from('это как будто снимок паспорта');
    const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    return Promise.all([
      fingerprintStream(Readable.from([bytes])),
      fingerprintStream(Readable.from([bytes])),
      fingerprintStream(Readable.from([Buffer.from('другой файл')]))
    ]).then(([first, second, other]) => {
      expect(first).toBe(expected);
      expect(second).toBe(first);
      expect(other).not.toBe(first);
    });
  });

  it('по отпечатку нельзя восстановить содержимое', () => {
    /*
     * Проверка не «криптографическая», а смысловая: в строке не должно быть исходных данных.
     * Именно поэтому отпечаток можно хранить сколько угодно, в отличие от самого снимка.
     */
    return fingerprintStream(Readable.from([Buffer.from('СНИЛС 123-456-789 00')])).then(
      (fingerprint) => {
        expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(fingerprint).not.toContain('123');
      }
    );
  });

  it('оборванный поток даёт «нет отпечатка», а не исключение', async () => {
    /*
     * Главное свойство: удаление персональных данных не имеет права остановиться из-за того,
     * что не удалось снять отпечаток. Лучше протокол без отпечатка, чем паспортный скан,
     * который остался лежать, потому что хранилище моргнуло.
     */
    const broken = new Readable({
      read() {
        this.destroy(new Error('хранилище не ответило'));
      }
    });
    await expect(fingerprintStream(broken)).resolves.toBeNull();
  });

  it('слишком большой файл не вычитывается целиком', () => {
    /*
     * Снимок паспорта весит мегабайты, а не сотни. Файл такого размера — это или ошибка, или
     * чужой файл, и тянуть его в память незачем.
     */
    const huge = Readable.from([Buffer.alloc(65 * 1024 * 1024)]);
    return expect(fingerprintStream(huge)).resolves.toBeNull();
  });
});

describe('поле отпечатков собирается честно (Р17)', () => {
  it('складываются только те, что удалось снять', () => {
    expect(collectFingerprints({ selfie: 'sha256:aa', passport: null })).toEqual({
      selfie: 'sha256:aa'
    });
  });

  it('когда не снято ничего — поля нет вовсе', () => {
    /*
     * Пустой объект выглядел бы как «отпечатки были и потерялись». Отсутствие поля честно
     * говорит «снять не удалось».
     */
    expect(collectFingerprints({ selfie: null, passport: null })).toBeUndefined();
  });
});

describe('отпечаток действительно снимается и сохраняется (Р17)', () => {
  it('снимается ДО удаления файлов', () => {
    /* После удаления читать уже нечего — порядок здесь и есть вся суть. */
    const purgeAt = scanner.indexOf('deleteFile(tenantId, record.selfieFileId)');
    const fingerprintAt = scanner.indexOf('collectFingerprints({');
    expect(fingerprintAt).toBeGreaterThan(-1);
    expect(fingerprintAt, 'отпечаток снимается после удаления файла').toBeLessThan(purgeAt);
  });

  it('сохраняется в записи проверки', () => {
    expect(scanner).toMatch(/record\.imageHashes = fingerprints/);
  });

  it('попадает и в журнал аудита', () => {
    /*
     * Запись проверки может быть изменена, а журнал аудита дополняется только вперёд — там
     * отпечаток переживёт что угодно.
     */
    expect(scanner).toMatch(
      /newValues: \{ imagesPurgedAt: now, [\s\S]{0,80}imageHashes: fingerprints/
    );
  });

  it('неудача отпечатка не останавливает удаление', () => {
    /* Иначе паспортный скан остался бы лежать из-за сбоя во вспомогательной операции. */
    expect(scanner).toMatch(/private async fingerprintOf\([\s\S]{0,600}return null;/);
  });
});
