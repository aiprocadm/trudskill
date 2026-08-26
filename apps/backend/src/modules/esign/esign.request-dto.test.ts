import { describe, expect, it } from 'vitest';

import {
  CreateEsignApplicationDto,
  CreateSigningParticipantDto,
  CreateSigningProcessDto,
  EsignReasonDto,
  ParticipantActionDto,
  UpdateSigningParticipantDto
} from './esign.request-dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';

/**
 * Вход раздела электронной подписи.
 *
 * До ревизии 2026-08-26 эти двенадцать ручек не проверяли тело вообще: типы объявлены
 * интерфейсами, а интерфейс при сборке исчезает. Здесь это опаснее, чем в среднем по
 * продукту: подписание — то, на чём держится доказательная сила документа.
 */

describe('заявка на подпись', () => {
  it('обычная заявка проходит', () => {
    expect(assertValidDto(CreateEsignApplicationDto, { learnerId: 'lrn_1' }).learnerId).toBe(
      'lrn_1'
    );
  });

  it('пустой слушатель отклоняется', () => {
    expect(() => assertValidDto(CreateEsignApplicationDto, { learnerId: '' })).toThrow();
  });

  it('срок принимается только в виде ISO', () => {
    expect(() =>
      assertValidDto(CreateEsignApplicationDto, { learnerId: 'lrn_1', expiresAt: '31.12.2026' })
    ).toThrow();
    expect(
      assertValidDto(CreateEsignApplicationDto, {
        learnerId: 'lrn_1',
        expiresAt: '2026-12-31T10:00:00Z'
      }).expiresAt
    ).toBe('2026-12-31T10:00:00Z');
  });
});

describe('причина отказа объясняется словами', () => {
  it('внятная причина проходит', () => {
    expect(assertValidDto(EsignReasonDto, { reason: 'паспорт нечитаем' }).reason).toBe(
      'паспорт нечитаем'
    );
  });

  it('прочерк вместо объяснения отклоняется', () => {
    expect(() => assertValidDto(EsignReasonDto, { reason: '-' })).toThrow();
  });
});

describe('процесс подписания', () => {
  const valid = { idempotencyKey: 'idem_1', generatedDocumentId: 'doc_1' };

  it('обычный запрос проходит', () => {
    expect(assertValidDto(CreateSigningProcessDto, valid).generatedDocumentId).toBe('doc_1');
  });

  it('снимок документа строкой отклоняется — юридический след должен быть разбираемым', () => {
    expect(() =>
      assertValidDto(CreateSigningProcessDto, { ...valid, snapshot: 'просто строка' })
    ).toThrow();
  });

  it('снимок объектом проходит', () => {
    expect(
      assertValidDto(CreateSigningProcessDto, { ...valid, snapshot: { fio: 'Иванов И. И.' } })
        .snapshot
    ).toEqual({ fio: 'Иванов И. И.' });
  });
});

describe('участник подписания', () => {
  const valid = {
    processId: 'prc_1',
    participantType: 'commission_member',
    participantUserId: 'usr_1',
    signOrder: 1
  };

  it('обычный участник проходит', () => {
    expect(assertValidDto(CreateSigningParticipantDto, valid).signOrder).toBe(1);
  });

  it('выдуманный тип участника отклоняется', () => {
    expect(() =>
      assertValidDto(CreateSigningParticipantDto, { ...valid, participantType: 'директор' })
    ).toThrow();
  });

  it('нулевой и отрицательный порядок отклоняются — они ломают очередь подписания', () => {
    expect(() => assertValidDto(CreateSigningParticipantDto, { ...valid, signOrder: 0 })).toThrow();
    expect(() =>
      assertValidDto(CreateSigningParticipantDto, { ...valid, signOrder: -3 })
    ).toThrow();
  });

  it('дробный порядок отклоняется', () => {
    expect(() =>
      assertValidDto(CreateSigningParticipantDto, { ...valid, signOrder: 1.5 })
    ).toThrow();
  });

  it('правка порядка проверяется так же', () => {
    expect(() => assertValidDto(UpdateSigningParticipantDto, { signOrder: 0 })).toThrow();
    expect(assertValidDto(UpdateSigningParticipantDto, { signOrder: 2 }).signOrder).toBe(2);
  });
});

describe('действие участника: подписать, отказаться, пропустить', () => {
  it('ключ повторной отправки обязателен — на нём держится защита от двойной подписи', () => {
    expect(() => assertValidDto(ParticipantActionDto, {})).toThrow();
  });

  it('обычное действие проходит', () => {
    expect(assertValidDto(ParticipantActionDto, { idempotencyKey: 'sign_1' }).idempotencyKey).toBe(
      'sign_1'
    );
  });
});
