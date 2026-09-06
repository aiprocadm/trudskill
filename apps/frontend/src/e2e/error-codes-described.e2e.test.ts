import { describe, expect, it } from 'vitest';

import { errorCodeInventory } from './error-code-inventory';
import { errorText } from '../lib/errors/error-text';

/**
 * `TXT-004` — «Ошибка объясняет, что произошло и что делать».
 *
 * Со среза 24 это исполняет словарь `lib/errors/error-text.ts`: код ошибки → две фразы,
 * «что произошло» и «что делать». Кода, которого словарь не знает, он не бросает: берётся
 * запасной текст по СТАТУСУ ответа — «код может быть новым, а смысл статуса прежним».
 *
 * Замысел верный, но не для всякого статуса. 404 действительно значит «записи нет», и общий
 * текст ей подходит. А 400 значит что угодно — и «проверьте заполненные поля» уходит человеку
 * на «в комиссии нет председателя»; 409 значит что угодно — и «такая запись уже есть» уходит
 * на «лимит тарифа исчерпан»; 503 — и «повторите через минуту» уходит на «вход через Госуслуги
 * выключен», который через минуту не включится.
 *
 * Инвариант: про каждый код, который бэкенд отдаёт человеку, принято решение — либо у него
 * своя статья, либо он записан сюда с причиной, почему общего текста достаточно. Молча
 * положиться на статус нельзя: новый код обязан пройти через эту развилку.
 */

/** Одна причина на группу кодов: `...because('…', 'a', 'b')`. */
const because = (reason: string, ...codes: string[]): Record<string, string> =>
  Object.fromEntries(codes.map((code) => [code, reason]));

/**
 * Коды, которым хватает общего текста по статусу, — с причиной.
 *
 * Причина обязана называть, ПОЧЕМУ статус здесь несёт смысл кода, а не «текст и так сойдёт».
 * Признак верной причины: подставьте общий текст статуса вместо статьи и прочитайте вслух —
 * если получилось правдой и советом по делу, код здесь; если нет, ему нужна статья.
 */
const STATUS_EXPLAINS: Record<string, string> = {
  ...because(
    '404 «Запись не найдена — возможно, её удалили; вернитесь к списку и откройте заново»: ' +
      'записи действительно нет, и совет верный — искать её в списке',
    'dialog_not_found',
    'notification_not_found',
    'webinar_not_found',
    'role_not_found',
    'learner_not_found',
    'course_not_found',
    'library_course_not_found',
    'recertification_draft_not_found',
    'license_not_found',
    'order_not_found',
    'plan_not_found',
    'invoice_not_found',
    'tenant_settings_not_found',
    'tenant_requisites_not_found',
    'impersonation_target_not_found',
    'template_not_found',
    'eisot_testing_batch_not_found',
    'frdo_registry_batch_not_found',
    'nmo_batch_not_found',
    'ot_registry_batch_not_found',
    'rostechnadzor_batch_not_found'
  ),
  ...because(
    '409 «Такая запись уже есть; откройте существующую или измените отличающее поле — номер, ' +
      'код или почту»: это ровно тот случай — занят номер, код или имя',
    'template_variable_code_taken',
    'document_number_taken',
    'library_code_taken',
    'commission_code_conflict',
    'license_number_conflict',
    'plan_code_taken',
    'tenant_code_taken',
    'invoice_number_taken'
  ),
  ...because(
    '400 «Данные в форме не подходят; проверьте заполненные поля и сохраните ещё раз»: ' +
      'здесь и правда не заполнено или не сходится поле формы, а не мешает состояние записи',
    'revocation_reason_required',
    'reissue_reason_required',
    'invalid_template_type',
    'identity_files_must_differ',
    'commission_member_identity_required',
    'course_document_set_positions_invalid',
    'license_valid_until_before_issued_at',
    'invalid_branding'
  ),
  ...because(
    '401 «Вход не выполнен или срок сессии истёк; войдите заново»: во всех этих случаях ' +
      'сессия и правда негодна, и вход заново — единственное, что помогает',
    'invalid_token',
    'no_tenant',
    'missing_csrf',
    'invalid_csrf',
    'invalid_refresh',
    'invalid_totp_challenge',
    'session_expired',
    'refresh_replay',
    'esia_identity_no_session'
  ),
  ...because(
    '503 «Сбой на стороне сервера — с вашими данными ничего не случилось; повторите через ' +
      'минуту»: хранилище недоступно временно, повтор действительно помогает',
    'library_store_unavailable',
    'health_store_unavailable',
    'plan_store_unavailable',
    'tenant_store_unavailable',
    'billing_store_unavailable'
  )
};

/**
 * Коды, которые до экрана человека не доходят, — с причиной.
 *
 * Служебные ручки и защиты, срабатывание которых означает ошибку в нашем коде или в настройке
 * стенда, а не действие человека. Заводить им статью — значит писать текст, которого никто
 * никогда не прочитает.
 */
const NOT_FOR_PEOPLE: Record<string, string> = {
  metrics_token_required: 'ручка метрик — её читает сборщик метрик, а не человек',
  worker_callback_disabled: 'обратный вызов воркера; отвечает при ненастроенном секрете стенда',
  in_memory_state_disabled: 'защита запуска: сервис не должен работать с памятью вне тестов',
  readiness_failed: 'проба готовности для оркестратора',
  tenant_scope_violation:
    'защита слоя работы с базой: срабатывание — ошибка в нашем коде, а не действие человека',
  proctoring_chunk_duplicate:
    'повторная отправка куска видеозаписи фоном — экран о ней не знает, запись продолжается',
  esia_no_tenant: 'разбор адреса возврата Госуслуг до входа: экрана с этим ответом нет'
};

const inventory = errorCodeInventory();

/** Текст, который получит незнакомый код с этим статусом. */
const fallbackFor = (status: number) => errorText({ status, code: '__нет_такого_кода__' } as never);

/**
 * Статус, которого нет в запасной раскладке словаря, — по нему видно «общий текст на всё».
 * Через него же проверяется наличие своей статьи: она возвращается вместо общего текста.
 */
const NO_SUCH_STATUS = 599_999;
const NOTHING_EXPLAINS = fallbackFor(NO_SUCH_STATUS);

/** У кода есть своя статья, если словарь отвечает ею даже при статусе, который он не знает. */
const hasArticle = (code: string): boolean =>
  errorText({ status: NO_SUCH_STATUS, code } as never) !== NOTHING_EXPLAINS;

describe('TXT-004 · про каждый код ошибки принято решение', () => {
  it('сторож видит броски, а не пустой список', () => {
    expect(inventory.throws).toBeGreaterThanOrEqual(300);
    expect(inventory.codes.size).toBeGreaterThanOrEqual(150);
  });

  it('у каждого броска выведен статус — новая форма не проходит молча', () => {
    expect(inventory.unresolvedStatus.map((u) => `${u.location} [${u.exception}]`)).toEqual([]);
  });

  it('каждый код либо описан статьёй, либо записан с причиной', () => {
    const undecided = [...inventory.codes.entries()]
      .filter(([code]) => !(code in STATUS_EXPLAINS) && !(code in NOT_FOR_PEOPLE))
      .filter(([code]) => !hasArticle(code))
      .map(([code, v]) => `${code} [${[...v.statuses].join('/')}] ${v.places[0]}`);
    expect(undecided, `кодов без решения: ${undecided.length}`).toEqual([]);
  });
  it('списки не протухают — записанный код всё ещё бросается бэкендом', () => {
    const gone = [...Object.keys(STATUS_EXPLAINS), ...Object.keys(NOT_FOR_PEOPLE)]
      .filter((code) => !inventory.codes.has(code))
      .map((code) => `${code} — записан в стороже, но бэкенд его больше не бросает`);
    expect(gone).toEqual([]);
  });

  it('код не числится сразу в двух местах', () => {
    const both = [...inventory.codes.keys()].filter(
      (code) =>
        [hasArticle(code), code in STATUS_EXPLAINS, code in NOT_FOR_PEOPLE].filter(Boolean).length >
        1
    );
    expect(both, 'решение по коду должно быть одно').toEqual([]);
  });

  /*
   * «Статус объясняет» — проверяемое утверждение, а не отговорка: у статуса обязан быть свой
   * текст в запасной раскладке. На 422 его не было вовсе, и `esia_snils_mismatch` («СНИЛС в
   * Госуслугах не совпадает») получал общий текст «Действие не выполнено. Повторите ещё раз» —
   * совет, который на 422 не работает никогда.
   */
  it('у каждого статуса, который отдаёт бэкенд, есть свой запасной текст', () => {
    const statuses = new Set(
      [...inventory.codes.entries()]
        .filter(([code]) => !(code in NOT_FOR_PEOPLE))
        .flatMap(([, entry]) => [...entry.statuses])
    );
    const empty = [...statuses]
      .filter((status) => fallbackFor(status) === NOTHING_EXPLAINS)
      .map((status) => `статус ${status} ничего не объясняет — у него нет своего текста`);
    expect(empty.sort()).toEqual([]);
  });

  /*
   * Названия форматов файлов — единственная разрешённая латиница, как и у сторожа заголовков
   * `latin-titles-ban` (срез 19): человек видит `.docx` в окне выбора файла, и «сохраните в
   * формате Word» вместо расширения ему не помогает.
   */
  const FILE_FORMATS = /\.(docx|xlsx|pdf|zip|csv|png|jpg)\b/gi;

  it('человек читает по-русски: ни латиницы, ни кодов, ни подчёркиваний', () => {
    const bad: string[] = [];
    for (const [code, entry] of inventory.codes) {
      if (code in NOT_FOR_PEOPLE) continue;
      for (const status of entry.statuses) {
        const { what, next } = errorText({ status, code } as never);
        const text = `${what} ${next}`.replace(FILE_FORMATS, ' ');
        if (/[A-Za-z]/.test(text)) bad.push(`${code} [${status}] — латиница: ${text}`);
        if (/_/.test(text)) bad.push(`${code} [${status}] — подчёркивание: ${text}`);
        if (!/[А-Яа-яЁё]/.test(text)) bad.push(`${code} [${status}] — не по-русски: ${text}`);
        if (!next.trim()) bad.push(`${code} [${status}] — нет ответа «что делать»`);
      }
    }
    expect(bad).toEqual([]);
  });
});
