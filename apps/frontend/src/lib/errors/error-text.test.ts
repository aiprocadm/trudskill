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
        message: 'Tenant is suspended'
      })
    );
    const archived = humanErrorMessage(
      err({
        status: 401,
        code: 'tenant_archived',
        message: 'Tenant is archived'
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
  /*
   * Ревизия 2026-09-06 (§5.422) — класс «текст ошибки отвечает коду, а не статусу».
   *
   * Словарь знал 34 кода из 167. Остальные отвечали запасным текстом по статусу — и там, где
   * статус смысла не несёт, человек читал неправду. Ниже — по одному случаю на каждый статус,
   * который врал; в каждом проверяется и то, что человек теперь читает, и то, чего он больше
   * НЕ читает.
   */
  it('409 не выдаёт исчерпанный тариф за дубликат записи', () => {
    const text = humanErrorMessage(
      err({ status: 409, code: 'staff_limit_reached', message: 'Staff limit reached' })
    );

    expect(text).toContain('тариф');
    expect(text).not.toContain('Такая запись уже есть');
  });

  it('503 не советует «повторить через минуту» там, где повтор не поможет', () => {
    const text = humanErrorMessage(
      err({ status: 503, code: 'esia_disabled', message: 'Вход через Госуслуги недоступен' })
    );

    expect(text).toContain('Госуслуги');
    expect(text).not.toContain('Повторите через минуту');
    expect(text).not.toContain('Сбой на стороне сервера');
  });

  it('422 не советует «повторите ещё раз» — сервер понял запрос и отказал по существу', () => {
    const text = humanErrorMessage(
      err({
        status: 422,
        code: 'esia_snils_mismatch',
        message: 'СНИЛС в Госуслугах не совпадает с вашими данными'
      })
    );

    expect(text).toContain('учебный центр');
    expect(text).not.toContain('Повторите ещё раз');
  });

  it('412 говорит слушателю, что именно открыть, а не «обновите страницу»', () => {
    const text = humanErrorMessage(
      err({ status: 412, code: 'module_gate_locked', message: 'Module test must be passed first' })
    );

    expect(text).toContain('предыдущ');
    expect(text).not.toContain('какого шага не хватает');
  });

  it('401 на неверный пароль говорит про пароль, а не только «войдите заново»', () => {
    const text = humanErrorMessage(
      err({ status: 401, code: 'invalid_credentials', message: 'Invalid credentials' })
    );

    expect(text).toContain('пароль');
    expect(text).not.toContain('срок сессии истёк');
  });

  it('403 не советует просить права там, где дело в тарифе', () => {
    const text = humanErrorMessage(
      err({ status: 403, code: 'plan_feature_unavailable', message: 'Feature not in plan' })
    );

    expect(text).toContain('тариф');
    expect(text).not.toContain('для вашей роли');
  });

  it('404 не отправляет «в список» там, где запись есть, а файла у неё нет', () => {
    const text = humanErrorMessage(
      err({
        status: 404,
        code: 'frdo_registry_file_not_found',
        message: 'Batch has no generated file'
      })
    );

    expect(text).toContain('не собран');
    expect(text).not.toContain('Вернитесь к списку');
  });

  it('400 не выдаёт правило жизненного цикла за ошибку в полях формы', () => {
    const text = humanErrorMessage(
      err({ status: 400, code: 'commission_archived', message: 'Commission is archived' })
    );

    expect(text).toContain('архив');
    expect(text).not.toContain('Проверьте заполненные поля');
  });
  /*
   * Ревизия 2026-09-07 (§5.426). Шесть кодов бэкенд отдаёт через свои классы поверх исключений
   * Nest, и сторож §5.422 их не видел: он искал только `throw new *Exception(`. Молчание
   * сторожа читалось как «решение принято» — а решения не было вовсе.
   */
  it('чужой заказ не выдаётся за нехватку прав', () => {
    const text = humanErrorMessage(
      err({
        status: 403,
        code: 'order_access_denied',
        message: 'Заказ не принадлежит пользователю'
      })
    );

    // Сообщение сервера по-русски и по делу — оно и становится «что произошло»; статья даёт
    // «что делать». Раньше «что делать» приходило от статуса 403 — «попросите администратора
    // открыть доступ», хотя доступ ни при чём: заказ просто чужой.
    expect(text).toContain('разделе оплат');
    expect(text).not.toContain('для вашей роли');
    expect(text).not.toContain('администратора');
  });

  it('оплаченный заказ не выдаётся за ошибку в полях формы', () => {
    const text = humanErrorMessage(
      err({ status: 400, code: 'order_not_payable', message: 'Заказ не ожидает оплаты' })
    );

    expect(text).toContain('оплаты');
    expect(text).not.toContain('Проверьте заполненные поля');
  });

  it('чужая правка поверх вашей советует обновить страницу, а не «изменить номер»', () => {
    // Сервер отвечает по-русски, поэтому «что произошло» берётся из его сообщения,
    // а «что делать» — из статьи. Общий текст 409 советовал бы не то.
    const text = humanErrorMessage(
      err({
        status: 409,
        code: 'tenant_state_conflict',
        message: 'Данные центра изменил кто-то ещё, пока вы работали.'
      })
    );

    expect(text).toContain('Обновите страницу');
    expect(text).not.toContain('измените отличающее поле');
  });
});
