import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ФТ-D1 / ФТ-G1 (gap A2) — «permission-модель на 100% endpoints».
 *
 * Требование звучит как «право на каждой ручке», но буквально это невыполнимо и не нужно:
 * у входа прав ещё нет, у внешнего вебхука их не может быть в принципе, а проверка живости
 * обязана отвечать без всякой аутентификации. Поэтому инвариант формулируется иначе:
 *
 *   **обработчик либо объявляет право, либо перечислен ниже вместе с ответом,
 *   ЧЕМ он защищён вместо права.**
 *
 * Список — реестр решений, а не способ погасить красный тест. Каждая строка отвечает на
 * вопрос «почему сюда можно без права», и если ответа нет — значит это дефект, а не запись.
 *
 * Так и нашлись три дефекта этого среза (миграция 0083):
 *   • `PUT /tenant/settings` и `PUT /tenant/requisites` не требовали НИЧЕГО, а экран
 *     реквизитов открыт по `tenant.read`, которое есть у слушателя. Из реквизитов берутся
 *     юридическое название, ИНН и картинки подписи с печатью для выдаваемых удостоверений;
 *   • обе эти ручки к тому же падали ошибкой сервера при сохранении;
 *   • `POST /webhooks/reprocess-failed` был недостижим — его перехватывал вебхук-маршрут.
 *
 * Проверено подсадным нарушителем: новая ручка без права и без записи роняет тест.
 */

const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), '../../modules');

interface Allowed {
  /** `<путь от modules>::<Метод> <маршрут>` */
  handler: string;
  /** Чем защищён вместо права. */
  why: string;
}

const WITHOUT_PERMISSION: ReadonlyArray<Allowed> = [
  // --- Проверки состояния: обязаны отвечать без аутентификации, иначе бесполезны.
  {
    handler: 'health/health.controller.ts::Get ',
    why: 'общая проверка доступности по контракту: отвечает «служба жива», данных не отдаёт'
  },
  { handler: 'health/health.controller.ts::Get live', why: 'проверка живости, без данных' },
  { handler: 'health/health.controller.ts::Get startup', why: 'проверка запуска, без данных' },
  { handler: 'health/health.controller.ts::Get ready', why: 'готовность, без данных' },

  // --- Вход и своя сессия: прав ещё нет либо человек управляет СВОИМ доступом.
  ...[
    ['Post auth/2fa/verify', 'второй шаг входа: подписанный вызов из первого шага'],
    ['Get auth/2fa/status', 'состояние своей двухфакторной защиты'],
    ['Post auth/2fa/setup', 'настройка своей двухфакторной защиты'],
    ['Post auth/2fa/confirm', 'подтверждение своей двухфакторной защиты'],
    ['Post auth/2fa/disable', 'отключение своей двухфакторной защиты'],
    ['Post auth/magic-link/request', 'запрос ссылки для входа: ограничен частотой (ФТ-G2)'],
    ['Post auth/magic-link/redeem', 'обмен одноразовой ссылки на сессию'],
    ['Get auth/csrf', 'значение уже пришедшей cookie, без неё сама даёт отказ'],
    ['Post auth/refresh', 'продление своей сессии, сверяет x-csrf-token с cookie'],
    ['Post auth/logout', 'выход из своей сессии'],
    ['Post auth/logout-all', 'выход из всех своих сессий'],
    ['Get auth/me', 'свой профиль'],
    ['Get auth/sessions', 'список своих сессий'],
    ['Get permissions', 'справочник кодов прав, персональных данных не содержит']
  ].map(([handler, why]) => ({ handler: `iam/auth.controller.ts::${handler}`, why: why! })),

  // --- Вход через ЕСИА: переходы браузера, прав ещё нет.
  {
    handler: 'mvp/esia/esia.controller.ts::Get auth/esia/authorize',
    why: 'начало входа через госуслуги'
  },
  {
    handler: 'mvp/esia/esia.controller.ts::Post auth/esia/identity/authorize',
    why: 'подтверждение личности: требует вошедшего пользователя (context.userId)'
  },
  {
    handler: 'mvp/esia/esia.controller.ts::Get auth/esia/callback',
    why: 'возврат от госуслуг: авторизует подписанный state'
  },

  // --- Личные действия человека над собой: право тут ничего не добавит.
  {
    handler: 'mvp/consents/consent.controller.ts::Post me/:kind/grant',
    why: 'человек даёт СВОЁ согласие'
  },
  {
    handler: 'mvp/consents/consent.controller.ts::Post me/:kind/revoke',
    why: 'человек отзывает СВОЁ согласие'
  },
  {
    handler: 'mvp/esignature/simple-signature.controller.ts::Get status',
    why: 'состояние своей простой подписи'
  },
  {
    handler: 'mvp/esignature/simple-signature.controller.ts::Post accept',
    why: 'человек принимает документ СВОЕЙ подписью'
  },

  // --- Переписка и уведомления: доступ определяется участием, а не ролью.
  ...[
    ['Get ', 'свои диалоги'],
    ['Post ', 'создание диалога с собой в участниках'],
    ['Get :id', 'доступ проверяется участием в диалоге (assertDialogAccess)'],
    ['Get :id/messages', 'доступ проверяется участием в диалоге'],
    ['Post :id/messages', 'доступ проверяется участием в диалоге'],
    ['Post :id/read', 'доступ проверяется участием в диалоге']
  ].map(([handler, why]) => ({
    handler: `communication/chat.controller.ts::${handler}`,
    why: why!
  })),
  ...[
    ['Get ', 'свои уведомления'],
    ['Get unread-counter', 'счётчик своих непрочитанных'],
    ['Get :id', 'своё уведомление'],
    ['Post :id/read', 'отметка своего уведомления прочитанным'],
    ['Post read-all', 'отметка всех своих прочитанными']
  ].map(([handler, why]) => ({
    handler: `communication/notifications.controller.ts::${handler}`,
    why: why!
  })),
  ...[
    ['Get subscriptions', 'свои подписки на push'],
    ['Post subscribe', 'подписка своего устройства'],
    ['Delete subscribe', 'отписка своего устройства']
  ].map(([handler, why]) => ({
    handler: `communication/web-push/web-push.controller.ts::${handler}`,
    why: why!
  })),

  // --- Внешние вебхуки: у чужой системы прав нет и быть не может, подлинность — подпись.
  {
    handler: 'communication/webinars-webhook.controller.ts::Post webhook',
    why: 'внешний вебхук вебинаров, проверка подписи внутри адаптера'
  },
  {
    handler: 'mvp/video/video-webhook.controller.ts::Post ',
    why: 'внешний вебхук видеосервиса, проверка подписи внутри адаптера'
  },
  {
    handler: 'platform/rental-billing-webhook.controller.ts::Post rental-billing/webhook',
    why: 'внешний вебхук банка об оплате АРЕНДЫ; тела запроса не верим — адаптер переспрашивает состояние платежа у банка, счёт находится по provider_invoice_id'
  },
  {
    handler: 'payments/payments-webhook.controller.ts::Post webhook/:providerCode',
    why: 'внешний вебхук эквайера, проверка подписи + сверка суммы'
  },
  {
    handler: 'integrations/webhooks/webhooks.controller.ts::Post :providerCode',
    why: 'внешний вебхук интеграции, проверка подписи'
  },
  {
    handler: 'integrations/webhooks/webhooks.controller.ts::Post :providerCode/:eventType',
    why: 'то же, с явным типом события'
  },

  // --- Внутренние вызовы фоновой службы: защищены общим секретом, fail-closed без него.
  ...[
    ['Post start', 'воркер забирает задачу выдачи документа'],
    ['Post result-upload-intent', 'воркер получает ссылку для загрузки результата'],
    ['Post complete', 'воркер отчитывается об успехе'],
    ['Post fail', 'воркер отчитывается об ошибке']
  ].map(([handler, why]) => ({
    handler: `documents/documents-internal-worker.controller.ts::${handler}`,
    why: `${why!}; защищено общим секретом (WorkerCallbackGuard)`
  })),
  {
    handler: 'mvp/mvp-internal-worker.controller.ts::Post mvp/bulk-enrollments',
    why: 'обратный вызов воркера массового зачисления; общий секрет (WorkerCallbackGuard)'
  },

  // --- Сверка данных при миграции: кросс-тенантная по замыслу, общий секрет.
  ...[
    'Post runs',
    'Post runs/start',
    'Post runs/:runId/process',
    'Post runs/:runId/run',
    'Get runs/:runId',
    'Get runs/:runId/items',
    'Get reports/:runId',
    'Get reports/:runId/export',
    'Get diagnostics'
  ].map((handler) => ({
    handler: `migration/backfill/backfill.controller.ts::${handler}`,
    why: 'кросс-тенантная сверка при миграции; общий секрет (WorkerCallbackGuard), fail-closed'
  })),

  // --- Публичные по замыслу.
  {
    handler: 'documents/public-verify.controller.ts::Get verify/:token',
    why: 'проверка подлинности документа по QR: смысл в том, чтобы её мог сделать любой'
  },
  {
    handler: 'platform/public-tenant.controller.ts::Get tenants/by-code/:code',
    why: 'резолв центра для страницы входа: отдаёт только имя и оформление'
  },
  {
    handler: 'mvp/scorm/scorm-content.controller.ts::Get :token/*rest',
    why: 'содержимое курса в рамке: рамка не умеет слать заголовки, подлинность — токен в адресе'
  },

  // --- Вход и справочники входа.
  {
    handler: 'iam/auth.controller.ts::Post auth/login',
    why: 'вход по паролю: прав ещё нет, ограничен частотой обращений (ФТ-G2)'
  },
  {
    handler: 'iam/auth.controller.ts::Get roles',
    why: 'справочник ролей своего центра: коды и названия, персональных данных нет'
  },
  /*
   * Проверка написана ВНУТРИ обработчика и она точнее декоратора: свои роли человек видит
   * всегда, чужие — только с правом `iam.manage_roles`. Поставить сюда декоратор значило бы
   * запретить человеку смотреть собственные роли.
   */
  {
    handler: 'iam/auth.controller.ts::Get users/:id/roles',
    why: 'свои роли — всегда, чужие — только с iam.manage_roles (проверка внутри обработчика)'
  },
  {
    handler: 'communication/web-push/web-push.controller.ts::Get public-key',
    why: 'открытый ключ push-уведомлений: он и должен быть открытым'
  },

  // --- Свои согласия и тексты документов, которые человек подписывает.
  {
    handler: 'mvp/consents/consent.controller.ts::Get me',
    why: 'свои согласия'
  },
  {
    handler: 'mvp/consents/consent.controller.ts::Get documents',
    why: 'тексты документов, которые человек принимает: он обязан их прочитать до согласия'
  },
  {
    handler: 'mvp/esignature/simple-signature.controller.ts::Get agreement',
    why: 'текст соглашения о простой подписи: читается до подписания'
  },
  {
    handler: 'mvp/mvp.controller.ts::Get ot-training-programs',
    why: 'глобальный справочник типовых программ обучения, одинаков для всех'
  },

  /*
   * --- Карточка центра: пять записей отсюда УБРАНЫ ревизией 2026-08-26.
   *
   * Здесь стояли `Get me`, `Get settings`, `Get requisites`, `Get identity-settings`,
   * `Get commission` с объяснением вида «читает любой сотрудник СВОЕГО центра». Объяснение
   * звучало разумно и было неполным: в системе есть роль, которая сотрудником центра не
   * является вовсе — представитель компании-заказчика. Права `tenant.read` у него нет
   * (сверено с `iam.role_permissions` живой базы, а не с названием роли), а ручки его не
   * спрашивали — экраны `/academy/*` закрыты правом только на фронте.
   *
   * Урок не про эти пять строк, а про сам реестр: запись в нём легализует открытую ручку
   * ровно настолько, насколько верно её объяснение. «Любой сотрудник» — это про роли, а
   * ручка отвечает всем вошедшим. Теперь все пять требуют `tenant.read` — то же право,
   * которое уже требует экран.
   */
  {
    handler: 'tenant/tenant.controller.ts::Get branding',
    why: 'оформление центра: логотип и цвета рисуются в шапке КАЖДОМУ вошедшему, включая роли без tenant.read; запись — под правом'
  }
];

const ROUTE = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;

const controllers = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...controllers(full));
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
};

/**
 * Право «принадлежит» ручке, если объявлено в ЕЁ цепочке декораторов: либо между её
 * маршрутом и следующим, либо в непрерывной цепочке декораторов прямо над ней.
 *
 * Наивное «искать от предыдущего маршрута до конца текущего» ошибается: право соседней
 * ручки засчитывается текущей. На этом проверка соврала при первом прогоне — поэтому
 * граница определяется явно.
 */
const declaresPermission = (source: string, start: number, end: number): boolean => {
  if (source.slice(start, end).includes('RequirePermissions')) return true;
  // Идём вверх по строкам-декораторам, стоящим непосредственно над маршрутом.
  const above = source.slice(0, start).split('\n');
  for (let i = above.length - 1; i >= 0; i -= 1) {
    const line = above[i]!.trim();
    if (line === '') continue;
    if (line.startsWith('*') || line.startsWith('/*') || line.startsWith('//')) continue;
    if (!line.startsWith('@')) break;
    if (line.includes('RequirePermissions')) return true;
  }
  return false;
};

const handlersWithoutPermission = (): string[] => {
  const found: string[] = [];
  for (const file of controllers(MODULES)) {
    const source = readFileSync(file, 'utf8');
    const matches = [...source.matchAll(ROUTE)];
    for (const [index, match] of matches.entries()) {
      const start = match.index ?? 0;
      const next = matches[index + 1];
      const end = next ? (next.index ?? source.length) : source.length;
      if (declaresPermission(source, start, end)) continue;
      const relative = file
        .slice(MODULES.length + 1)
        .split(sep)
        .join('/');
      const route = (match[2] ?? '').replace(/['"]/g, '');
      found.push(`${relative}::${match[1]} ${route}`);
    }
  }
  return found.sort();
};

describe('право объявлено или объяснено его отсутствие (ФТ-D1 gap A2)', () => {
  it('реестр совпадает с фактическим положением дел', () => {
    const actual = handlersWithoutPermission();
    const allowed = WITHOUT_PERMISSION.map((item) => item.handler).sort();

    const unexpected = actual.filter((handler) => !allowed.includes(handler));
    expect(
      unexpected,
      'Появилась ручка без объявленного права. Либо добавьте @RequirePermissions, либо ' +
        'внесите её в WITHOUT_PERMISSION с ответом: чем она защищена вместо права ' +
        '(участие в диалоге, подпись вебхука, общий секрет, публичность по замыслу).'
    ).toEqual([]);

    const stale = allowed.filter((handler) => !actual.includes(handler));
    expect(
      stale,
      'Запись в реестре больше никого не описывает: ручка исчезла или уже объявляет право. ' +
        'Уберите строку — устаревший реестр перестают читать.'
    ).toEqual([]);
  });

  it('у каждой записи есть внятное обоснование', () => {
    const weak = WITHOUT_PERMISSION.filter((item) => item.why.trim().length < 12).map(
      (i) => i.handler
    );
    expect(weak, 'запись без объяснения — это отложенный дефект, а не решение').toEqual([]);
  });

  it('записи не дублируются', () => {
    const seen = new Set<string>();
    const duplicates = WITHOUT_PERMISSION.filter((item) => {
      if (seen.has(item.handler)) return true;
      seen.add(item.handler);
      return false;
    }).map((i) => i.handler);
    expect(duplicates).toEqual([]);
  });
});
