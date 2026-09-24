import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ФТ-D1 «изоляция до конца» — сторож на уровне ОБРАБОТЧИКА, а не контроллера.
 *
 * Соседний сторож (`controllers-tenant-scope.isolation.test.ts`) проверяет, что контроллер
 * проходит через `TenantGuard`. Этого мало: охранник ВЫЧИСЛЯЕТ арендатора, но не заставляет
 * обработчик его использовать. Ручка может честно стоять под охранником и при этом дёргать
 * сервис без арендатора — тогда она работает по всем центрам сразу.
 *
 * Инвариант: обработчик либо упоминает арендатора (`tenantId`), либо перечислен ниже
 * вместе с ответом на вопрос «почему ему арендатор не нужен».
 *
 * Что это ловит на практике: ровно так был найден дефект каталога интеграций — изменяющие
 * ручки не передавали арендатора, потому что каталог общий, и правом арендатора можно было
 * выключить провайдера всем центрам сразу (миграция 0082,
 * `integrations/platform-catalog.isolation.test.ts`).
 *
 * Проверено подсадным нарушителем: новая ручка без арендатора и без записи в списке роняет
 * этот тест.
 */

const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), '../../modules');

interface Allowed {
  /** `<путь от modules>::<Метод> <маршрут>` */
  handler: string;
  why: string;
}

/**
 * Обработчики, которым арендатор не нужен. Пополнять ТОЛЬКО с обоснованием —
 * список читается как реестр решений, а не как способ погасить красный тест.
 */
const WITHOUT_TENANT: ReadonlyArray<Allowed> = [
  /*
   * МГ-C1.2: уровни образования (ФРДО) и страны — глобальные справочники, одинаковые для всех
   * центров; должности (`Get positions`) — на центр, арендатора знают.
   */
  {
    handler: 'lookup/lookup.controller.ts::Get education-levels',
    why: 'глобальный список уровней образования ФРДО, персональных данных нет'
  },
  {
    handler: 'lookup/lookup.controller.ts::Get countries',
    why: 'глобальный список стран (ISO 3166-1), персональных данных нет'
  },
  /*
   * ТЗ 12.2: словарь подписей состояний фоновых задач. Арендатор ему не нужен — «В очереди» и
   * «Готово» одинаковы для всех центров. Сам список задач (`Get `) арендатора знает.
   */
  {
    handler: 'background-tasks/background-tasks.controller.ts::Get labels',
    why: 'словарь слов, а не данные: подписи состояний одинаковы для всех центров'
  },
  // --- Служебные проверки состояния: живы ли процесс и зависимости. Арендатора нет вовсе.
  {
    handler: 'health/health.controller.ts::Get ',
    why: 'общая проверка доступности: отвечает за процесс, а не за данные центра'
  },
  { handler: 'health/health.controller.ts::Get live', why: 'проверка живости процесса' },
  { handler: 'health/health.controller.ts::Get startup', why: 'проверка запуска' },
  { handler: 'health/health.controller.ts::Get ready', why: 'готовность принимать запросы' },

  // --- Вход и общие справочники прав: арендатор ещё не определён или не при чём.
  {
    handler: 'iam/auth.controller.ts::Get auth/csrf',
    why: 'первый шаг восстановления сессии: возвращает значение уже пришедшей cookie'
  },
  {
    handler: 'iam/auth.controller.ts::Get permissions',
    why: 'справочник кодов прав — один на платформу, персональных данных не содержит'
  },
  {
    handler: 'communication/web-push/web-push.controller.ts::Get public-key',
    why: 'открытый ключ push-уведомлений — общий для установки, не секрет'
  },

  // --- Платформенный каталог интеграций: у провайдера нет арендатора, привязка центра
  //     живёт в учётных данных. Изменяющие ручки закрыты платформенным правом (0082).
  {
    handler: 'integrations/integrations.controller.ts::Get providers',
    why: 'каталог провайдеров общий; арендатору нужен для выбора подключения'
  },
  {
    handler: 'integrations/integrations.controller.ts::Get providers/:id',
    why: 'то же, карточка провайдера каталога'
  },
  {
    handler: 'integrations/integrations.controller.ts::Post providers',
    why: 'платформенный каталог, право platform.integrations.write (0082)'
  },
  {
    handler: 'integrations/integrations.controller.ts::Patch providers/:id',
    why: 'платформенный каталог, право platform.integrations.write (0082)'
  },
  {
    handler: 'integrations/integrations.controller.ts::Post providers/:id/activate',
    why: 'платформенный каталог, право platform.integrations.write (0082)'
  },
  {
    handler: 'integrations/integrations.controller.ts::Post providers/:id/deactivate',
    why: 'платформенный каталог, право platform.integrations.write (0082)'
  },

  // --- Внешний вебхук: арендатор резолвится внутри по подписи и коду провайдера.
  {
    handler: 'platform/rental-billing-webhook.controller.ts::Post rental-billing/webhook',
    why: 'внешний вебхук банка об оплате АРЕНДЫ; тела запроса не верим — адаптер переспрашивает состояние платежа у банка, счёт находится по provider_invoice_id'
  },
  {
    handler: 'integrations/webhooks/webhooks.controller.ts::Post :providerCode',
    why: 'внешний вебхук; подлинность — подпись, арендатор резолвится по данным события'
  },

  // --- Сверка данных при миграции: работает СКВОЗЬ арендаторов по замыслу,
  //     защищена общим секретом (WorkerCallbackGuard, fail-closed без секрета).
  {
    handler: 'migration/backfill/backfill.controller.ts::Post runs',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Post runs/start',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Post runs/:runId/process',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Post runs/:runId/run',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Get runs/:runId',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Get runs/:runId/items',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Get reports/:runId',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Get reports/:runId/export',
    why: 'кросс-тенантная сверка'
  },
  {
    handler: 'migration/backfill/backfill.controller.ts::Get diagnostics',
    why: 'кросс-тенантная сверка'
  },

  // --- Библиотека курсов платформы: общий каталог. Копирование В свой центр — уже с арендатором.
  {
    handler: 'mvp/library/platform-library.controller.ts::Get library/courses',
    why: 'общий каталог курсов платформы; копирование к себе идёт отдельной ручкой с арендатором'
  },
  {
    handler: 'mvp/library/platform-library.controller.ts::Post platform/library/courses',
    why: 'наполнение каталога платформой'
  },
  {
    handler: 'mvp/library/platform-library.controller.ts::Delete platform/library/courses/:id',
    why: 'наполнение каталога платформой'
  },

  // --- Глобальные справочники: нормативные акты и типовые программы одинаковы для всех.
  {
    handler: 'mvp/mvp.controller.ts::Get reports/builder/entities',
    why: 'перечень сущностей конструктора отчётов — описание схемы, не данные'
  },
  {
    handler: 'mvp/mvp.controller.ts::Get regulatory-acts',
    why: 'глобальный справочник нормативных актов'
  },
  {
    handler: 'mvp/mvp.controller.ts::Get ot-training-programs',
    why: 'глобальный справочник типовых программ обучения'
  },

  // --- Платформенная админка: смотрит и управляет арендаторами, поэтому одним не ограничена.
  {
    handler: 'platform/platform-health.controller.ts::Get health/tenants',
    why: 'сводка по всем арендаторам'
  },
  { handler: 'platform/platform-plans.controller.ts::Get plans', why: 'тарифы платформы' },
  { handler: 'platform/platform-plans.controller.ts::Post plans', why: 'тарифы платформы' },
  {
    handler: 'platform/platform-plans.controller.ts::Post tenants/:id/plan',
    why: 'назначение тарифа арендатору: целевой арендатор приходит в адресе, а не из сессии'
  },
  { handler: 'platform/platform-tenants.controller.ts::Get ', why: 'реестр арендаторов' },
  {
    handler: 'platform/platform-tenants.controller.ts::Get :id/onboarding-path',
    why:
      'ТЗ 13.1: путь подключения ЧУЖОГО центра — администратор платформы смотрит центр, ' +
      'названный в адресе, а не свой. Арендатор здесь параметр запроса, а не контекст сессии; ' +
      'право `platform.tenants.read` есть только у роли платформы'
  },
  { handler: 'platform/platform-tenants.controller.ts::Post ', why: 'создание арендатора' },
  {
    handler: 'platform/platform-tenants.controller.ts::Patch :id/status',
    why: 'смена статуса арендатора'
  },
  {
    handler: 'platform/public-tenant.controller.ts::Get tenants/by-code/:code',
    why: 'публичный резолв арендатора по коду для страницы входа: отдаёт только имя и оформление'
  },
  {
    handler: 'platform/rental-billing.controller.ts::Post platform/rental-invoices',
    why: 'счета за аренду выставляет платформа'
  },
  {
    handler: 'platform/rental-billing.controller.ts::Get platform/rental-invoices/:id/pdf',
    why: 'счета за аренду выставляет платформа'
  },
  {
    handler: 'platform/rental-billing.controller.ts::Post platform/rental-invoices/:id/paid',
    why: 'счета за аренду выставляет платформа'
  }
];

const ROUTE = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;

const listControllers = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listControllers(full));
    } else if (entry.endsWith('.controller.ts')) {
      out.push(full);
    }
  }
  return out;
};

const handlersWithoutTenant = (): string[] => {
  const found: string[] = [];
  for (const file of listControllers(MODULES)) {
    const source = readFileSync(file, 'utf8');
    const matches = [...source.matchAll(ROUTE)];
    for (const [index, match] of matches.entries()) {
      const start = match.index ?? 0;
      const next = matches[index + 1];
      const end = next ? (next.index ?? source.length) : source.length;
      if (source.slice(start, end).includes('tenantId')) continue;
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

describe('каждый обработчик знает про арендатора или объяснил, почему нет (ФТ-D1)', () => {
  it('список исключений совпадает с фактическим', () => {
    const actual = handlersWithoutTenant();
    const allowed = WITHOUT_TENANT.map((item) => item.handler).sort();

    const unexpected = actual.filter((handler) => !allowed.includes(handler));
    expect(
      unexpected,
      'Появился обработчик, который не использует арендатора. Либо передайте в сервис ' +
        '`ctx.tenantId` (иначе ручка работает по всем учебным центрам сразу), либо внесите ' +
        'её в WITHOUT_TENANT этого файла с объяснением, почему арендатор не нужен.'
    ).toEqual([]);

    const stale = allowed.filter((handler) => !actual.includes(handler));
    expect(
      stale,
      'Запись в WITHOUT_TENANT больше никого не описывает: обработчик исчез или уже ' +
        'использует арендатора. Уберите строку, иначе список превращается в мусор, ' +
        'который перестают читать.'
    ).toEqual([]);
  });

  it('у каждого исключения есть непустое обоснование', () => {
    const empty = WITHOUT_TENANT.filter((item) => item.why.trim().length < 10).map(
      (i) => i.handler
    );
    expect(empty, 'исключение без объяснения — это не решение, а отложенный дефект').toEqual([]);
  });

  it('исключения не дублируются', () => {
    const seen = new Set<string>();
    const duplicates = WITHOUT_TENANT.filter((item) => {
      if (seen.has(item.handler)) return true;
      seen.add(item.handler);
      return false;
    }).map((i) => i.handler);
    expect(duplicates).toEqual([]);
  });
});
