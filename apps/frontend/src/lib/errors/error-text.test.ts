import { describe, expect, it } from 'vitest';

import { describeError, errorDetailsLine, humanErrorMessage } from './error-text';

import type { NormalizedApiError } from './api-error';

/**
 * `TXT-004`: ошибка объясняет, что произошло и что делать; технический код — под спойлером.
 *
 * До этого среза экран показывал то, что прислал сервер, слово в слово: «Unexpected API error»,
 * «Verification link is invalid», «tenant_header_mismatch». Администратору учебного центра это
 * не говорит ни что случилось, ни что делать дальше, а код ошибки в основном тексте — шум.
 *
 * Тонкость, ради которой сторож и написан: **часть серверных сообщений уже человеческие и
 * русские** («СНИЛС не проходит проверку контрольной суммы…»). Заменить их общей фразой
 * «Данные не подходят» — значит потерять единственное место, где сказано, что именно не так.
 * Поэтому правило такое: русское сообщение сервера сохраняется как «что произошло», а «что
 * делать» дописывается всегда.
 */

const err = (over: Partial<NormalizedApiError> = {}): NormalizedApiError => ({
  status: 500,
  code: 'internal_error',
  message: 'Unexpected API error',
  isAuthError: false,
  ...over
});

describe('TXT-004 · текст ошибки для человека', () => {
  it('техническое сообщение сервера заменяется человеческим, латиницы не остаётся', () => {
    const text = humanErrorMessage(err({ status: 500, code: 'internal_error' }));

    expect(text).toMatch(/[А-Яа-яЁё]/);
    expect(text).not.toMatch(/[A-Za-z]/);
    expect(text).not.toContain('internal_error');
  });

  it('русское сообщение сервера сохраняется — в нём вся конкретика', () => {
    const serverSaid = 'СНИЛС не проходит проверку контрольной суммы — вероятна опечатка.';
    const text = humanErrorMessage(
      err({ status: 400, code: 'validation_error', message: serverSaid })
    );

    expect(text).toContain('СНИЛС не проходит проверку');
  });

  it('в тексте всегда есть «что делать», а не только «что случилось»', () => {
    // Проверяем по существу: у каждого варианта два предложения — событие и действие.
    for (const sample of [
      err({ status: 403, code: 'permission_denied' }),
      err({ status: 404, code: 'not_found' }),
      err({ status: 409, code: 'conflict' }),
      err({ status: 429, code: 'too_many_requests' }),
      err({ status: 500, code: 'internal_error' })
    ]) {
      const text = humanErrorMessage(sample);
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, `нет подсказки «что делать»: «${text}»`).toBeGreaterThanOrEqual(2);
    }
  });

  it('незнакомый код не оставляет человека без объяснения', () => {
    const text = humanErrorMessage(
      err({ status: 403, code: 'never_seen_before_code', message: 'nope' })
    );

    expect(text).toMatch(/[А-Яа-яЁё]/);
    expect(text).not.toContain('never_seen_before_code');
    expect(text).not.toContain('nope');
  });

  it('приостановленный или архивный учебный центр — человеку говорят это прямо (журнал 337)', () => {
    // До 337 такого отказа не было вовсе: приостановленный за неуплату центр работал. Теперь
    // сервер отвечает `tenant_suspended` / `tenant_archived`, и общая фраза «нет доступа» тут
    // хуже правды: администратор должен понять, что дело в центре, а не в его пароле.
    const suspended = humanErrorMessage(
      err({
        status: 401,
        code: 'tenant_suspended',
        message: 'Tenant is suspended',
        isAuthError: true
      })
    );
    const archived = humanErrorMessage(
      err({
        status: 401,
        code: 'tenant_archived',
        message: 'Tenant is archived',
        isAuthError: true
      })
    );

    expect(suspended).toMatch(/приостановлен/i);
    expect(archived).toMatch(/архив/i);
    for (const text of [suspended, archived]) {
      expect(text).not.toMatch(/[A-Za-z]/);
      expect(text.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('технический код и номер запроса живут отдельно — для спойлера «Подробности»', () => {
    const line = errorDetailsLine(
      err({ status: 404, code: 'not_found', requestId: 'req_42', message: 'Entity not found' })
    );

    expect(line).toContain('not_found');
    expect(line).toContain('req_42');
    // Исходное сообщение сервера тоже там: по нему разработчик находит место в коде.
    expect(line).toContain('Entity not found');
  });

  it('без номера запроса строка подробностей не ломается', () => {
    // `err()` без переопределений и есть случай «номер запроса не пришёл».
    const line = errorDetailsLine(err());
    expect(line).toContain('internal_error');
    expect(line).not.toContain('запрос:');
  });
});

describe('TXT-004 · разбор пойманной ошибки', () => {
  it('ошибка запроса даёт и объяснение, и подробности', () => {
    const apiError = Object.assign(new Error('Entity not found'), {
      normalized: err({ status: 404, code: 'not_found', message: 'Entity not found' })
    });

    const view = describeError(apiError);
    expect(view.message).toMatch(/[А-Яа-яЁё]/);
    expect(view.message).not.toContain('not_found');
    expect(view.details).toContain('not_found');
  });

  it('обычной ошибке код не выдумывается — подробностей нет', () => {
    const view = describeError(new Error('Нет активной сессии'));
    expect(view.message).toBe('Нет активной сессии');
    expect(view.details).toBeUndefined();
  });

  it('брошено не-Error — человек всё равно получает объяснение', () => {
    const view = describeError('что-то пошло не так');
    expect(view.message).toMatch(/[А-Яа-яЁё]/);
    expect(view.message.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });
  /*
   * Ревизия 2026-09-06 — класс «ошибка объявлена в бэкенде, доносит ли она свой смысл».
   *
   * 49 бросков в документах, электронной подписи и общении шли строковой формой, без кода.
   * Фронт кода не находил, подставлял `internal_error`, и на «заявку можно менять только в
   * черновике» человек читал «Сбой на стороне сервера — с вашими данными ничего не
   * случилось. Повторите через минуту». Он повторял, и повторялось то же самое.
   */
  it('состояние записи больше не выдаётся за сбой сервера', () => {
    const text = humanErrorMessage(
      err({
        status: 400,
        code: 'domain_rule_violation',
        message: 'Only draft application can be updated'
      })
    );

    expect(text).not.toContain('Сбой на стороне сервера');
    expect(text).toContain('состояние записи');
    // Английское сообщение сервера человеку не показывается — его место в спойлере.
    expect(text).not.toMatch(/[A-Za-z]/);
  });

  it('коды, на которых общий текст по статусу врал бы, отвечают по существу', () => {
    // 409 сказал бы «Такая запись уже есть» — а дело в том, что подпись назначена другому.
    const foreign = humanErrorMessage(
      err({ status: 409, code: 'signing_assignment_not_yours', message: 'Not your assignment' })
    );
    expect(foreign).toContain('назначена');
    expect(foreign).not.toContain('уже есть');

    // 400 сказал бы «Проверьте заполненные поля» — а надо добавить участников.
    const noParticipants = humanErrorMessage(
      err({ status: 400, code: 'signing_participants_required', message: 'No participants' })
    );
    expect(noParticipants).toContain('участник');
    expect(noParticipants).not.toContain('заполненные поля');

    // 403 сказал бы «нет прав» — а личный диалог просто на двоих.
    const dialog = humanErrorMessage(
      err({ status: 403, code: 'direct_dialog_participants', message: 'Exactly 2 participants' })
    );
    expect(dialog).toContain('двоих');
    expect(dialog).not.toContain('прав');
  });

  it('технический код остаётся в спойлере, а не в тексте', () => {
    const error = err({
      status: 400,
      code: 'domain_rule_violation',
      message: 'Only draft application can be updated',
      requestId: 'req_7'
    });

    expect(describeError({ normalized: error })).toEqual({
      message: humanErrorMessage(error),
      details: errorDetailsLine(error)
    });
    expect(errorDetailsLine(error)).toContain('domain_rule_violation');
    expect(humanErrorMessage(error)).not.toContain('domain_rule_violation');
  });
});
