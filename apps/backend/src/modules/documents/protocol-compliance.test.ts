import { describe, expect, it } from 'vitest';

import { PROTOCOL_REQUIREMENTS, validateProtocolTemplate } from './protocol-compliance.js';

/**
 * ФТ-A8 — мягкий комплаенс-валидатор протокола (п. 92 ПП 2464, Фаза 1 Task 10).
 *
 * Проверка предупреждает, а НЕ блокирует: бланк может нести реквизит текстом
 * («Протокол № ___ от ___»), и запрещать такой шаблон мы не вправе. Задача —
 * чтобы УЦ не узнал о пропущенном реквизите от инспектора.
 */

/** Бланк, закрывающий все требования каталогом переменных. */
const COMPLIANT = [
  'tenant.legal_name',
  'document.number',
  'document.issue_date',
  'course.title',
  'group_learners',
  'program.final_assessment_form_label',
  'commission.chairman.name',
  'commission.members'
];

describe('validateProtocolTemplate (ФТ-A8)', () => {
  it('на полном бланке не жалуется', () => {
    const result = validateProtocolTemplate(COMPLIANT);

    expect(result.missing).toHaveLength(0);
    expect(result.isCompliant).toBe(true);
  });

  it('называет пропущенный реквизит человеческими словами', () => {
    const result = validateProtocolTemplate(COMPLIANT.filter((code) => code !== 'document.number'));

    expect(result.isCompliant).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]!.title).toMatch(/номер/i);
    // Подсказка должна называть конкретный плейсхолдер, иначе админ не поймёт, что вписать.
    expect(result.missing[0]!.expected).toContain('document.number');
  });

  it('засчитывает любой из равнозначных вариантов реквизита', () => {
    // Наименование организации: годится и короткое, и юридическое.
    const short = validateProtocolTemplate(
      COMPLIANT.map((c) => (c === 'tenant.legal_name' ? 'tenant.name' : c))
    );

    expect(short.isCompliant).toBe(true);
  });

  it('дата прописью тоже закрывает требование о дате', () => {
    const result = validateProtocolTemplate(
      COMPLIANT.map((c) => (c === 'document.issue_date' ? 'document.issue_date_words' : c))
    );

    expect(result.isCompliant).toBe(true);
  });

  it('пустой бланк перечисляет все требования разом', () => {
    const result = validateProtocolTemplate([]);

    expect(result.missing).toHaveLength(PROTOCOL_REQUIREMENTS.length);
    expect(result.isCompliant).toBe(false);
  });

  it('состав комиссии засчитывается и председателем, и списком членов', () => {
    const onlyMembers = validateProtocolTemplate(
      COMPLIANT.filter((c) => c !== 'commission.chairman.name')
    );
    const onlyChairman = validateProtocolTemplate(
      COMPLIANT.filter((c) => c !== 'commission.members')
    );

    expect(onlyMembers.isCompliant).toBe(true);
    expect(onlyChairman.isCompliant).toBe(true);
  });

  it('каждое требование несёт ссылку на пункт нормы — админу нужно основание', () => {
    for (const requirement of PROTOCOL_REQUIREMENTS) {
      expect(requirement.basis).toMatch(/2464/);
      expect(requirement.expected.length).toBeGreaterThan(0);
    }
  });

  it('не спотыкается о неизвестные плейсхолдеры в бланке', () => {
    const result = validateProtocolTemplate([...COMPLIANT, 'учебный_центр.логотип']);

    expect(result.isCompliant).toBe(true);
  });
});
