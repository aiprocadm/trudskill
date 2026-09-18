import { describe, expect, it } from 'vitest';

import {
  decryptDocumentSnapshotAtRest,
  decryptLearnerPiiAtRest,
  encryptDocumentSnapshotAtRest,
  encryptLearnerPiiAtRest,
  isEncryptedPiiValue,
  snilsBlindIndex
} from './pii-crypto.js';

const learner = {
  id: 'learner_1',
  tenantId: 'tenant_demo',
  name: 'Иванов Иван',
  snils: '112-233-445 95',
  status: 'active'
};

describe('pii-crypto (ФТ-C3.3)', () => {
  it('encrypts snils at rest and adds the blind index; other fields untouched', () => {
    const atRest = encryptLearnerPiiAtRest(learner) as Record<string, unknown>;
    expect(isEncryptedPiiValue(atRest.snils)).toBe(true);
    /*
     * Проверяется, что в шифротексте нет ОТКРЫТОГО СНИЛС — целиком и без разделителей.
     *
     * Было `not.toContain('112')`: три цифры из номера. Шифротекст — это base64 случайных
     * байтов, и такая тройка изредка встречается в нём сама по себе; прогон краснел на
     * ровном месте примерно раз на несколько тысяч (журнал 486). Сторож, падающий случайно,
     * хуже отсутствующего: красный прогон начинают объяснять словами «наверное, опять флак».
     * Полное значение совпасть случайно не может, и проверка стала СТРОЖЕ, а не мягче.
     */
    expect(String(atRest.snils)).not.toContain(learner.snils);
    expect(String(atRest.snils)).not.toContain(learner.snils.replace(/\D/g, ''));
    expect(atRest.snilsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(atRest.name).toBe('Иванов Иван');
    expect(atRest.id).toBe('learner_1');
    // Исходный объект не мутирован (state в памяти остаётся открытым).
    expect(learner.snils).toBe('112-233-445 95');
  });

  it('round-trips: decrypt restores the original snils and strips the hash', () => {
    const atRest = encryptLearnerPiiAtRest(learner);
    const restored = decryptLearnerPiiAtRest(atRest) as Record<string, unknown>;
    expect(restored.snils).toBe('112-233-445 95');
    expect('snilsHash' in restored).toBe(false);
  });

  it('blind index is keyed and normalization-insensitive (mask vs digits)', () => {
    expect(snilsBlindIndex('112-233-445 95')).toBe(snilsBlindIndex('11223344595'));
    expect(snilsBlindIndex('11223344595')).not.toBe(snilsBlindIndex('11223344596'));
  });

  it('serialized at-rest JSON never contains the raw digits', () => {
    const json = JSON.stringify(encryptLearnerPiiAtRest(learner));
    expect(json).not.toContain('11223344595');
    expect(json).not.toContain('112-233-445');
  });

  it('passes through learners without snils and legacy plaintext documents', () => {
    const noSnils = { id: 'l2', tenantId: 't', name: 'Без СНИЛС' };
    expect(encryptLearnerPiiAtRest(noSnils)).toBe(noSnils);
    // Legacy plaintext из БД до Task 7 — отдаётся как есть (lazy-миграция при записи).
    const legacy = { id: 'l3', tenantId: 't', snils: '11223344595' };
    expect(decryptLearnerPiiAtRest(legacy)).toBe(legacy);
  });

  it('does not double-encrypt an already encrypted document', () => {
    const once = encryptLearnerPiiAtRest(learner);
    const twice = encryptLearnerPiiAtRest(once) as Record<string, unknown>;
    expect(twice.snils).toBe((once as Record<string, unknown>).snils);
  });
});

const generatedDoc = {
  id: 'gdoc_1',
  tenantId: 'tenant_demo',
  documentNumber: '26-ОТ-0001',
  fileId: 'file_docx',
  pdfFileId: 'file_pdf',
  variablesSnapshot: {
    'learner.full_name': 'Иванов Иван Иванович',
    'learner.snils': '112-233-445 95',
    'document.number': '26-ОТ-0001'
  }
};

describe('document snapshot at rest (ФТ-A1.4)', () => {
  it('encrypts the whole snapshot; other document fields stay readable', () => {
    const atRest = encryptDocumentSnapshotAtRest(generatedDoc) as Record<string, unknown>;
    expect(isEncryptedPiiValue(atRest.variablesSnapshot)).toBe(true);
    expect(atRest.documentNumber).toBe('26-ОТ-0001');
    expect(atRest.pdfFileId).toBe('file_pdf');
    // Исходный объект в памяти не мутирован.
    expect(typeof generatedDoc.variablesSnapshot).toBe('object');
  });

  it('serialized at-rest JSON leaks neither the name nor the SNILS', () => {
    const json = JSON.stringify(encryptDocumentSnapshotAtRest(generatedDoc));
    expect(json).not.toContain('Иванов');
    expect(json).not.toContain('112-233-445');
    expect(json).not.toContain('11223344595');
  });

  it('round-trips back to the exact same snapshot object', () => {
    const restored = decryptDocumentSnapshotAtRest(
      encryptDocumentSnapshotAtRest(generatedDoc)
    ) as typeof generatedDoc;
    expect(restored.variablesSnapshot).toEqual(generatedDoc.variablesSnapshot);
  });

  it('passes through documents without a snapshot and legacy plaintext ones', () => {
    const noSnapshot = { id: 'gdoc_2', tenantId: 't', fileId: 'f' };
    expect(encryptDocumentSnapshotAtRest(noSnapshot)).toBe(noSnapshot);
    const legacy = { id: 'gdoc_3', variablesSnapshot: { a: 1 } };
    expect(decryptDocumentSnapshotAtRest(legacy)).toBe(legacy);
  });

  it('does not double-encrypt', () => {
    const once = encryptDocumentSnapshotAtRest(generatedDoc) as Record<string, unknown>;
    const twice = encryptDocumentSnapshotAtRest(once) as Record<string, unknown>;
    expect(twice.variablesSnapshot).toBe(once.variablesSnapshot);
  });

  it('a corrupted ciphertext drops the snapshot but keeps the document readable', () => {
    const broken = { ...generatedDoc, variablesSnapshot: 'enc:v1:zzz:zzz:zzz' };
    const restored = decryptDocumentSnapshotAtRest(broken) as Record<string, unknown>;
    expect('variablesSnapshot' in restored).toBe(false);
    expect(restored.documentNumber).toBe('26-ОТ-0001');
    expect(restored.fileId).toBe('file_docx');
  });
});

/**
 * Расширение шифрования на почту, телефон и дату рождения (журнал 375, 08.09.2026).
 *
 * До этого шифровался один СНИЛС: выбрали самый сильный идентификатор и на нём остановились.
 * Но «ФИО + дата рождения» опознаёт человека не хуже, а почта и телефон — это ещё и способ до
 * него дотянуться. Тот, кто добрался до дампа базы, получал всё это открытым текстом.
 */
describe('шифруются все четыре персональных поля, а не один СНИЛС', () => {
  const learner = {
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    snils: '112-233-445 95',
    email: 'ivanov@example.test',
    phone: '+7 999 123-45-67',
    dateOfBirth: '1990-05-01'
  };

  it('в хранимой записи не остаётся ни одного открытого значения', () => {
    const stored = encryptLearnerPiiAtRest(learner) as Record<string, string>;

    for (const field of ['snils', 'email', 'phone', 'dateOfBirth']) {
      expect(stored[field], field).toMatch(/^enc:/);
    }
    /* Имя и фамилия остаются открытыми сознательно: по ним идут поиск и сортировка. */
    expect(stored.firstName).toBe('Иван');
    expect(stored.lastName).toBe('Иванов');
  });

  it('чтение возвращает ровно то, что записали', () => {
    const restored = decryptLearnerPiiAtRest(encryptLearnerPiiAtRest(learner)) as typeof learner;
    expect(restored).toMatchObject({
      snils: '112-233-445 95',
      email: 'ivanov@example.test',
      phone: '+7 999 123-45-67',
      dateOfBirth: '1990-05-01'
    });
  });

  it('карточка БЕЗ СНИЛСа тоже шифруется — почта не остаётся открытой', () => {
    /*
     * Прежняя редакция выходила по одному лишь СНИЛСу: нет его — нечего шифровать. У человека
     * без СНИЛСа почта и телефон так и лежали бы открытым текстом.
     */
    const stored = encryptLearnerPiiAtRest({
      id: 'lrn_2',
      firstName: 'Пётр',
      email: 'petrov@example.test'
    }) as Record<string, string>;
    expect(stored.email).toMatch(/^enc:/);
  });

  it('карточка без СНИЛСа читается: почта расшифровывается сама по себе', () => {
    const stored = encryptLearnerPiiAtRest({ id: 'lrn_2', email: 'petrov@example.test' });
    const restored = decryptLearnerPiiAtRest(stored) as { email: string };
    expect(restored.email).toBe('petrov@example.test');
  });

  it('пустые значения не шифруются — иначе «не заполнено» не отличить от шифртекста', () => {
    const stored = encryptLearnerPiiAtRest({ id: 'lrn_3', snils: '', email: '' }) as Record<
      string,
      string
    >;
    expect(stored.snils).toBe('');
    expect(stored.email).toBe('');
  });

  it('старая запись с открытыми полями читается как есть, а не ломается', () => {
    /* Ленивая миграция: до первого сохранения такие значения продолжают работать. */
    const legacy = { id: 'lrn_4', snils: '112-233-445 95', email: 'old@example.test' };
    expect(decryptLearnerPiiAtRest(legacy)).toEqual(legacy);
  });

  it('повторное шифрование не заворачивает шифртекст во второй слой', () => {
    const once = encryptLearnerPiiAtRest(learner);
    expect(encryptLearnerPiiAtRest(once)).toBe(once);
  });
});
