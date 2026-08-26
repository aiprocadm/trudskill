import { describe, expect, it } from 'vitest';

import {
  CloseGroupDto,
  CreateNumberingRuleDto,
  CreateTemplateDto,
  CreateTemplateVariableDto,
  DocumentReasonDto,
  GenerateDocumentDto,
  IssueGroupOrderDto,
  TenantImageSlotDto
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

describe('бланк документа: вход проверяется (порция 13)', () => {
  it('обычный бланк проходит', () => {
    expect(
      assertValidDto(CreateTemplateDto, { name: 'Удостоверение ОТ', templateType: 'certificate' })
        .templateType
    ).toBe('certificate');
  });

  it('выдуманный вид бланка отклоняется', () => {
    expect(() =>
      assertValidDto(CreateTemplateDto, { name: 'Бумажка', templateType: 'бумажка' })
    ).toThrow();
  });
});

describe('переменная бланка', () => {
  const valid = {
    templateVersionId: 'tplv_1',
    variableCode: 'learner.fio',
    displayName: 'ФИО слушателя',
    categoryCode: 'learner',
    dataType: 'string'
  };

  it('обычная переменная проходит', () => {
    expect(assertValidDto(CreateTemplateVariableDto, valid).variableCode).toBe('learner.fio');
  });

  it('кириллица в коде отклоняется — движок подстановки её не найдёт и оставит сырой тег', () => {
    expect(() =>
      assertValidDto(CreateTemplateVariableDto, { ...valid, variableCode: 'фио' })
    ).toThrow();
  });

  it('пробел в коде отклоняется', () => {
    expect(() =>
      assertValidDto(CreateTemplateVariableDto, { ...valid, variableCode: 'learner fio' })
    ).toThrow();
  });

  it('выдуманная категория отклоняется', () => {
    expect(() =>
      assertValidDto(CreateTemplateVariableDto, { ...valid, categoryCode: 'кадры' })
    ).toThrow();
  });
});

describe('правило нумерации', () => {
  it('обычное правило проходит', () => {
    expect(
      assertValidDto(CreateNumberingRuleDto, { documentType: 'certificate', startCounter: 137 })
        .startCounter
    ).toBe(137);
  });

  it('отрицательный стартовый номер отклоняется', () => {
    expect(() =>
      assertValidDto(CreateNumberingRuleDto, { documentType: 'certificate', startCounter: -5 })
    ).toThrow();
  });

  it('выдуманный период сброса отклоняется', () => {
    expect(() =>
      assertValidDto(CreateNumberingRuleDto, {
        documentType: 'certificate',
        resetPeriod: 'квартал'
      })
    ).toThrow();
  });
});

describe('слот подписи и печати', () => {
  it('привязка файла проходит', () => {
    expect(assertValidDto(TenantImageSlotDto, { fileId: 'fil_1', widthMm: 40 }).widthMm).toBe(40);
  });

  it('отвязка (пустое тело) проходит — это намеренная форма', () => {
    expect(assertValidDto(TenantImageSlotDto, {})).toBeTruthy();
  });

  it('печать шириной в метр отклоняется — это ошибка ввода', () => {
    expect(() => assertValidDto(TenantImageSlotDto, { fileId: 'fil_1', widthMm: 1000 })).toThrow();
  });
});
