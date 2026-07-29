import { describe, expect, it } from 'vitest';

import { hashAgreementBody, needsAcceptance } from './simple-signature.js';

/** ПЭП: доказуемость принятого текста (ФТ-C1.1, Фаза 3 Task 3). */

describe('hashAgreementBody', () => {
  it('одинаковый текст даёт одинаковый хэш', () => {
    expect(hashAgreementBody('Соглашение')).toBe(hashAgreementBody('Соглашение'));
  });

  it('изменение текста меняет хэш — иначе подпись ничего не доказывает', () => {
    expect(hashAgreementBody('Соглашение А')).not.toBe(hashAgreementBody('Соглашение Б'));
  });

  it('перевод строк из Word не создаёт новую версию', () => {
    // Копирование текста из Word приносит CRLF. Без нормализации все слушатели
    // получили бы требование принять «новое» соглашение с тем же содержанием.
    expect(hashAgreementBody('Первая\r\nВторая')).toBe(hashAgreementBody('Первая\nВторая'));
  });

  it('хвостовые пробелы и крайние пустые строки не считаются изменением', () => {
    expect(hashAgreementBody('Текст   \n\n')).toBe(hashAgreementBody('Текст'));
  });

  it('внутренние отступы значимы — это часть документа', () => {
    expect(hashAgreementBody('А\n\nБ')).not.toBe(hashAgreementBody('А\nБ'));
  });
});

describe('needsAcceptance', () => {
  const agreement = { version: 2, bodyHash: hashAgreementBody('Текст') };

  it('без соглашения принимать нечего', () => {
    expect(needsAcceptance(null, null)).toBe(false);
  });

  it('соглашение есть, принятия нет — требуется принять', () => {
    expect(needsAcceptance(agreement, null)).toBe(true);
  });

  it('принят тот же текст — повторно не требуем', () => {
    expect(needsAcceptance(agreement, { agreementVersion: 2, bodyHash: agreement.bodyHash })).toBe(
      false
    );
  });

  it('текст изменился — требуется принять заново', () => {
    expect(
      needsAcceptance(agreement, { agreementVersion: 1, bodyHash: hashAgreementBody('Старый') })
    ).toBe(true);
  });

  it('сравнивается ХЭШ, а не номер версии', () => {
    // Номер другой, но текст тот же (правка опечатки в пробелах) — гонять слушателей
    // по новому кругу незачем.
    expect(needsAcceptance(agreement, { agreementVersion: 99, bodyHash: agreement.bodyHash })).toBe(
      false
    );
  });
});
