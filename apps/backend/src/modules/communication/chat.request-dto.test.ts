import { describe, expect, it } from 'vitest';

import { CreateDialogDto, PostMessageDto } from './chat.request-dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';

/**
 * Вход чата. До ревизии 2026-08-26 тела обеих ручек описывались литералом и не
 * проверялись вовсе (§5.359): литерал при сборке исчезает, и проверяющий видит `Object`.
 */

describe('создание диалога', () => {
  const valid = { type: 'direct', participantUserIds: ['usr_1', 'usr_2'] };

  it('обычный диалог проходит', () => {
    expect(assertValidDto(CreateDialogDto, valid).participantUserIds).toHaveLength(2);
  });

  it('выдуманный вид диалога отклоняется', () => {
    expect(() => assertValidDto(CreateDialogDto, { ...valid, type: 'групповой' })).toThrow();
  });

  it('диалог без участников отклоняется — переписываться не с кем', () => {
    expect(() => assertValidDto(CreateDialogDto, { ...valid, participantUserIds: [] })).toThrow();
  });

  it('сотня с лишним участников отклоняется', () => {
    const many = Array.from({ length: 101 }, (_, i) => `usr_${i}`);
    expect(() => assertValidDto(CreateDialogDto, { ...valid, participantUserIds: many })).toThrow();
  });
});

describe('отправка сообщения', () => {
  it('обычное сообщение проходит', () => {
    expect(assertValidDto(PostMessageDto, { textBody: 'Здравствуйте' }).textBody).toBe(
      'Здравствуйте'
    );
  });

  it('пустое сообщение отклоняется', () => {
    expect(() => assertValidDto(PostMessageDto, { textBody: '' })).toThrow();
  });

  it('простыня в мегабайт отклоняется — это вставленный по ошибке файл', () => {
    expect(() => assertValidDto(PostMessageDto, { textBody: 'а'.repeat(10_001) })).toThrow();
  });
});
