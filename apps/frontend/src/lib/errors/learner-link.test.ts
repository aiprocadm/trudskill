import { describe, expect, it } from 'vitest';

import {
  LEARNER_NOT_LINKED_SHORT,
  LEARNER_NOT_LINKED_TEXT,
  isLearnerNotLinked
} from './learner-link';

/**
 * «Учётная запись не связана с карточкой слушателя» (ТЗ «Стабилизация, UX и развитие», 2.4 / Б6).
 *
 * Проверка жила в двух местах слово в слово — сравнением ТЕКСТА сообщения. Текст меняется,
 * код отказа нет, поэтому признак теперь общий и смотрит сначала на код.
 */

const apiError = (code: string, message = 'что-то') =>
  Object.assign(new Error(message), { normalized: { code, status: 400 } });

describe('признак «нет связи с карточкой слушателя» (ТЗ 2.4)', () => {
  it('узнаёт отказ по коду сервера', () => {
    expect(isLearnerNotLinked(apiError('learner_not_linked'))).toBe(true);
  });

  it('узнаёт и по тексту — для старых веток, где кода нет', () => {
    expect(isLearnerNotLinked(new Error('No learner profile is linked to the current user'))).toBe(
      true
    );
    expect(isLearnerNotLinked(new Error('learner_not_linked'))).toBe(true);
  });

  it('не путает с другими отказами', () => {
    expect(isLearnerNotLinked(apiError('permission_denied'))).toBe(false);
    expect(isLearnerNotLinked(apiError('not_found'))).toBe(false);
    expect(isLearnerNotLinked(null)).toBe(false);
    expect(isLearnerNotLinked(undefined), 'нет ошибки — значит, связь есть').toBe(false);
  });

  it('текст отвечает на три вопроса и не говорит кодами', () => {
    const all = Object.values(LEARNER_NOT_LINKED_TEXT).join(' ');
    expect(all, 'служебное имя отказа человеку ничего не сообщает').not.toContain(
      'learner_not_linked'
    );
    expect(LEARNER_NOT_LINKED_TEXT.next, 'человек обязан узнать, к кому идти').toContain(
      'администратор'
    );
  });

  it('короткая форма тоже называет следующий шаг, а не только беду', () => {
    expect(LEARNER_NOT_LINKED_SHORT).toContain('учебный центр');
  });
});
