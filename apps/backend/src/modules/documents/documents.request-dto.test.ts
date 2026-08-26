import { describe, expect, it } from 'vitest';

import {
  CloseGroupDto,
  DocumentReasonDto,
  GenerateDocumentDto,
  IssueGroupOrderDto
} from './documents.request-dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';

/**
 * Вход операций выпуска документов.
 *
 * До ревизии 2026-08-26 эти тела не проверялись ВООБЩЕ: они были типизированы
 * интерфейсами, а интерфейс при сборке исчезает — общий проверяющий видел `Object`
 * и пропускал что угодно. Тесты фиксируют, что теперь мусор останавливается на входе
 * и отвечает понятной причиной, а не ошибкой сервера где-то в глубине.
 */

const validGenerate = {
  idempotencyKey: 'idem_1',
  templateId: 'tpl_1',
  sourceEntityType: 'enrollment',
  sourceEntityId: 'enr_1',
  documentType: 'certificate'
};

describe('выпуск документа: вход проверяется', () => {
  it('правильное тело проходит', () => {
    expect(assertValidDto(GenerateDocumentDto, validGenerate).templateId).toBe('tpl_1');
  });

  it('число вместо идентификатора шаблона отклоняется', () => {
    expect(() =>
      assertValidDto(GenerateDocumentDto, { ...validGenerate, templateId: 5 })
    ).toThrow();
  });

  it('пустой идентификатор отклоняется — раньше уходил в домен', () => {
    expect(() =>
      assertValidDto(GenerateDocumentDto, { ...validGenerate, templateId: '' })
    ).toThrow();
  });

  it('лишнее поле отклоняется, а не молча сохраняется', () => {
    expect(() =>
      assertValidDto(GenerateDocumentDto, { ...validGenerate, посторонний: 'мусор' })
    ).toThrow();
  });

  it('дата в документе принимается только как ГГГГ-ММ-ДД', () => {
    expect(() =>
      assertValidDto(GenerateDocumentDto, { ...validGenerate, validUntil: '31.12.2026' })
    ).toThrow();
    expect(
      assertValidDto(GenerateDocumentDto, { ...validGenerate, validUntil: '2026-12-31' }).validUntil
    ).toBe('2026-12-31');
  });
});

describe('закрытие группы: вход проверяется', () => {
  const valid = {
    groupId: 'grp_1',
    protocolTemplateId: 'tpl_p',
    certificateTemplateId: 'tpl_c',
    enrollmentIds: ['enr_1', 'enr_2']
  };

  it('правильное тело проходит', () => {
    expect(assertValidDto(CloseGroupDto, valid).enrollmentIds).toHaveLength(2);
  });

  it('пустой список слушателей отклоняется — закрывать группу не по кому', () => {
    expect(() => assertValidDto(CloseGroupDto, { ...valid, enrollmentIds: [] })).toThrow();
  });

  it('пачка сверх потолка отклоняется сразу, а не роняет очередь', () => {
    const huge = Array.from({ length: 501 }, (_, i) => `enr_${i}`);
    expect(() => assertValidDto(CloseGroupDto, { ...valid, enrollmentIds: huge })).toThrow();
  });

  it('число внутри списка отклоняется', () => {
    expect(() =>
      assertValidDto(CloseGroupDto, { ...valid, enrollmentIds: ['enr_1', 42] })
    ).toThrow();
  });
});

describe('групповой приказ: вход проверяется', () => {
  it('пустой список зачислений ЗАКОНЕН — приказ бывает без каскада удостоверений', () => {
    const dto = assertValidDto(IssueGroupOrderDto, {
      groupId: 'grp_1',
      templateId: 'tpl_1',
      enrollmentIds: []
    });
    expect(dto.enrollmentIds).toEqual([]);
  });

  it('поле списка всё же обязано быть — иначе домен получит undefined', () => {
    expect(() =>
      assertValidDto(IssueGroupOrderDto, { groupId: 'grp_1', templateId: 'tpl_1' })
    ).toThrow();
  });

  it('мусор внутри списка отклоняется', () => {
    expect(() =>
      assertValidDto(IssueGroupOrderDto, {
        groupId: 'grp_1',
        templateId: 'tpl_1',
        enrollmentIds: [null]
      })
    ).toThrow();
  });
});

describe('причина отзыва и перевыпуска', () => {
  it('объяснение словами проходит', () => {
    expect(assertValidDto(DocumentReasonDto, { reason: 'ошибка в фамилии' }).reason).toBe(
      'ошибка в фамилии'
    );
  });

  it('пустая причина отклоняется — отзыв документа объясняют', () => {
    expect(() => assertValidDto(DocumentReasonDto, { reason: '' })).toThrow();
  });
});
