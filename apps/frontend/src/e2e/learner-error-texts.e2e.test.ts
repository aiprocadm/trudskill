import { describe, expect, it } from 'vitest';

import { errorText } from '../lib/errors/error-text';

/**
 * Тупики слушателя объясняются словами.
 *
 * Сервер отвечает на них по-английски («Attempt limit reached», «Attempt expired»), и это
 * правильно: технический текст уходит под спойлер «Подробности», а человеку показывается
 * статья словаря. Но если статьи нет, берётся общий текст по коду ответа — «данные
 * конфликтуют» вместо ответа на вопрос «почему тест не открывается и что теперь делать».
 *
 * Ревизия 2026-08-26 нашла восемь таких кодов. Это ровно те места, где слушатель упирается
 * посреди обязательного обучения, а администратору потом звонят.
 *
 * Сторож держит список: код из него обязан иметь СВОЮ статью, а не общий текст по статусу.
 */

/** Код → на чём именно спотыкается человек. */
const LEARNER_DEAD_ENDS: Record<string, string> = {
  attempt_limit_reached: 'попытки по тесту закончились',
  attempt_expired: 'время на попытку истекло',
  attempt_terminal: 'попытка завершена, ответы менять нельзя',
  attempt_readonly: 'попытка открыта только для просмотра',
  proctoring_required: 'экзамен под видеозапись, а запись не включена',
  photo_consent_required: 'нет согласия на фотографирование',
  identity_verification_required: 'личность не подтверждена',
  electronic_agreement_required: 'не принято соглашение об электронной подписи',
  scorm_package_not_ready: 'учебный пакет ещё обрабатывается',
  enrollment_not_completed: 'обучение не завершено',
  storage_limit_exceeded: 'закончилось место в хранилище'
};

/** Общий текст по коду ответа: если статьи нет, вернётся именно он. */
const genericForStatus = (status: number) =>
  errorText({ code: '__нет_такого_кода__', status, message: '' } as never);

describe('тупики слушателя объясняются словами', () => {
  for (const [code, situation] of Object.entries(LEARNER_DEAD_ENDS)) {
    it(`${code} — ${situation}`, () => {
      const text = errorText({ code, status: 409, message: 'Some english text' } as never);
      const generic = genericForStatus(409);

      expect(
        text.what,
        `для «${situation}» нет своей статьи — человек получит общий текст по коду ответа`
      ).not.toBe(generic.what);

      // Правило продукта: ошибка говорит, ЧТО произошло и ЧТО делать.
      expect(text.what.trim().length).toBeGreaterThan(10);
      expect(text.next.trim().length).toBeGreaterThan(10);
      expect(/[А-Яа-яЁё]/.test(text.what)).toBe(true);
      expect(/[А-Яа-яЁё]/.test(text.next)).toBe(true);
    });
  }

  it('английский ответ сервера не показывается человеку как основной текст', () => {
    /*
     * Проверка самого механизма: для кода без статьи основной текст всё равно берётся из
     * словаря, а английское сообщение сервера уходит в подробности.
     */
    const text = errorText({
      code: '__нет_такого_кода__',
      status: 500,
      message: 'Unexpected server error'
    } as never);
    expect(/[А-Яа-яЁё]/.test(text.what)).toBe(true);
  });
});
