import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Класс сверки «ЧТЕНИЕ отбирает по центру — все до одного» (режим ревизии, 2026-09-20).
 *
 * **Чем это отличается от соседних сторожей.** `controllers-tenant-scope` проверяет, что
 * контроллер стоит под охранником арендатора. `tenant-scoped-handlers` — что обработчик
 * арендатора УПОМИНАЕТ. Оба на уровень выше того, что важно: обработчик может честно принять
 * арендатора, передать его дальше — и конкретное чтение всё равно уйдёт без отбора. Один
 * забытый `item.tenantId === tenantId` в цепочке `.filter()` отдаёт список чужого центра, и
 * ни типы, ни те два сторожа этого не видят.
 *
 * **Что проверяется здесь.** Два пласта, потому что продукт читает данные двумя способами:
 *
 * 1. **Состояние в памяти** (модуль MVP и документы): `this.state.<коллекция>.filter(…)`.
 *    Отбор пишется руками на каждом месте — забыть его не стоит ничего.
 * 2. **Запросы к базе**: `select … from <схема>.<таблица>`. Таблицы, принадлежащие центру,
 *    выводятся ИЗ МИГРАЦИЙ — по наличию столбца `tenant_id`. Поэтому новая таблица попадает
 *    под проверку сама, без чьей-либо памяти.
 *
 * **Итог прогона класса (2026-09-20): чисто.** 305 чтений из состояния и 117 запросов к
 * базе; 28 кандидатов, все законные и перечислены ниже с причиной. Сторож написан не потому,
 * что что-то нашлось, а потому что «чисто сегодня» ничего не говорит про завтра.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');
const MIGRATIONS = resolve(BACKEND_SRC, '../migrations');

interface Allowed {
  /**
   * `<путь от src>::<коллекция>::<само выражение отбора>`.
   *
   * **Выражение входит в ключ намеренно, и это не педантизм.** Первый вариант этого сторожа
   * ключевался парой «файл + коллекция» — и подсаженная поломка «новая ручка списка
   * слушателей без отбора по центру» прошла незамеченной: в этом файле чтение слушателей уже
   * было оправдано, и оправдание распространилось на все будущие. Один раз объяснив частный
   * случай, легко выдать индульгенцию целому классу.
   */
  where: string;
  why: string;
}

/**
 * Чтения из состояния, которым отбор по центру не нужен. Только с причиной — список читается
 * как реестр решений, а не как способ погасить красный тест.
 */
const STATE_READS_WITHOUT_TENANT: ReadonlyArray<Allowed> = [
  {
    where:
      'modules/integrations/services/integration-orchestrator.service.ts::providers::((item) => this.matchesText(item, query?.q))',
    why: 'каталог провайдеров ОБЩИЙ для платформы: у записи нет арендатора вовсе (миграция 0082), изменяющие ручки стережёт platform-catalog.isolation'
  },
  {
    where:
      'modules/integrations/services/integration-orchestrator.service.ts::providers::((item) => item.id === id)',
    why: 'тот же общий каталог платформы: запись провайдера арендатору не принадлежит'
  },
  {
    where: 'modules/mvp/mvp.service.ts::counterparties::((c) => scopeAllows(scope, c.id))',
    why: 'отбор по представителю заказчика; результат уходит в list(source, tenantId, …), где отбор по центру и делается'
  },
  {
    where: 'modules/mvp/mvp.service.ts::learners::((l) => learnerIds.has(l.id))',
    why: 'слушатели по зачислениям, уже отобранным по центру; результат уходит в list(…, tenantId, …)'
  },
  {
    where: 'modules/mvp/mvp.service.ts::groups::((g) => scopeAllows(scope, g.counterpartyId))',
    why: 'группы по контрагентам представителя; результат уходит в list(…, tenantId, …)'
  },
  {
    where: 'modules/mvp/mvp.service.ts::modules::((row) => row.id === next.id)',
    why: 'перестановка программы: идентификаторы сверены с отобранным по центру списком в applyOrder — чужой отклоняется как «пункт не из этой программы»'
  },
  {
    where: 'modules/mvp/mvp.service.ts::materials::((row) => row.id === next.id)',
    why: 'перестановка материалов: идентификаторы сверены с отобранным по центру списком, см. выше'
  },
  {
    where: 'modules/mvp/mvp.service.ts::reportTemplates::((t) => t.id !== current.id)',
    why: 'удаление по записи, уже полученной через getById(…, tenantId, id)'
  },
  {
    where:
      'modules/mvp/mvp.service.ts::questions::((item) => item.questionBankId === questionBankId)',
    why: 'вопросы банка, проверенного по центру выше; результат уходит в list(…, tenantId, …)'
  },
  {
    where:
      'modules/documents/documents.service.ts::versions::((x) => x.templateId === req.templateId)',
    why: 'счётчик версий шаблона, проверенного по центру выше: шаблон принадлежит одному центру'
  },
  {
    where: 'modules/documents/documents.service.ts::variables::((x) => !x.deletedAt)',
    why: 'отсев удалённых перед must(…, tenantId, id), где отбор по центру и делается'
  },
  {
    where:
      'modules/documents/documents.service.ts::generatedDocuments::((d) => d.qrToken === token)',
    why: 'ПУБЛИЧНАЯ проверка документа по QR: она межцентровая по замыслу — код сканирует посторонний, и центр ему неизвестен; ответ арендатора не раскрывает'
  }
];

/** Запросы к базе, которым отбор по центру не нужен. */
const QUERIES_WITHOUT_TENANT: ReadonlyArray<Allowed> = [
  {
    where:
      "infrastructure/database/database.service.ts::documents.runtime_documents::select count(*)::int as backlog, coalesce(extract(epoch from now() - min((data->>'createdAt')::timestamptz)), 0)::int as lag_seconds from documents.runtime_documents where collection = 'tasks' and data->>'status' in ('queued', 'running')",
    why: 'показатель очереди задач по ВСЕЙ платформе: он и должен считать всех, персональных данных не отдаёт'
  },
  {
    where:
      'modules/payments/postgres-payments.repository.ts::payments.order_items::select * from payments.order_items where order_id = $1 order by created_at asc',
    why: 'строки заказа по номеру заказа, уже проверенного по центру строкой выше'
  },
  {
    where:
      'modules/payments/postgres-payments.repository.ts::payments.order_items::select * from payments.order_items where order_id = any($1) order by created_at asc',
    why: 'строки заказов по списку номеров, полученному запросом с отбором по центру'
  },
  {
    where:
      "modules/payments/postgres-payments.repository.ts::payments.orders::select * from payments.orders o where ${conditions.join(' and ')} order by o.created_at desc",
    why: 'условие «o.tenant_id = $1» кладётся в conditions[] первым и всегда — это видно строкой выше запроса'
  },
  {
    where:
      "modules/payments/postgres-payments.repository.ts::payments.payments::select * from payments.payments where ${conditions.join(' and ')}",
    why: 'вебхук платёжного сервиса приходит без арендатора: платёж ищется по внешнему номеру, центр берётся ИЗ НАЙДЕННОЙ записи, и заказ дальше сверяется с ним же'
  },
  {
    where:
      'modules/platform/rental-billing.service.ts::core.rental_invoices::select ${INVOICE_COLUMNS} from core.rental_invoices order by issued_at desc limit 200',
    why: 'счета ПЛАТФОРМЫ центрам: читает платформенный администратор по праву platform.tenants.read; своя ручка центра передаёт свой арендатор отдельно'
  },
  {
    where:
      'modules/platform/rental-billing.service.ts::core.rental_invoices::select ${INVOICE_COLUMNS} from core.rental_invoices where id = $1',
    why: 'один счёт платформы по номеру: ручки под правом platform.tenants.read/write, центр здесь не сторона, а предмет счёта'
  },
  {
    where:
      'modules/platform/rental-billing.service.ts::core.rental_invoices::select id from core.rental_invoices where provider_invoice_id = $1',
    why: 'поиск счёта по номеру у платёжного сервиса при обработке его ответа — арендатора в ответе нет'
  },
  {
    where:
      "modules/platform/retention-sweeper.service.ts::iam.sessions::delete from iam.sessions where ctid in ( select ctid from iam.sessions where (expires_at < now() - ($1 || ' days')::interval) or (revoked_at is not null and revoked_at < now() - ($1 || ' days')::interval) limit ${BATCH_SIZE} )",
    why: 'уборка по СРОКУ хранения идёт по всей платформе — это её работа, а не работа центра'
  },
  {
    where:
      "modules/platform/retention-sweeper.service.ts::iam.magic_link_tokens::delete from iam.magic_link_tokens where ctid in ( select ctid from iam.magic_link_tokens where created_at < now() - ($1 || ' days')::interval and (consumed_at is not null or expires_at < now()) limit ${BATCH_SIZE} )",
    why: 'уборка по сроку хранения по всей платформе, см. выше'
  },
  {
    where:
      "modules/platform/retention-sweeper.service.ts::audit.audit_log::delete from audit.audit_log where ctid in ( select ctid from audit.audit_log where created_at < now() - ($1 || ' days')::interval limit ${BATCH_SIZE} )",
    why: 'уборка журнала по сроку хранения по всей платформе, см. выше'
  },
  {
    where:
      'modules/iam/services/seed-credential-hygiene.service.ts::iam.users::update iam.users set password_hash = $1, updated_at = now() where password_hash = $2 returning id',
    why: 'обезвреживание утёкшего пароля из демонстрационного набора идёт по ВСЕЙ платформе — в этом и смысл: опасен он везде одинаково'
  },
  {
    where:
      "modules/iam/services/auth.service.ts::iam.sessions::update iam.sessions set consumed_at = now(), rotated_at = now(), revoked_at = now(), revoke_reason = 'rotated', updated_at = now() where id = $1 and revoked_at is null returning id",
    why: 'смена сеанса по его собственному номеру: номер пришёл из токена самого человека, чужой сеанс по нему не найти'
  },
  {
    where:
      'modules/platform/rental-billing.service.ts::core.rental_invoices::update core.rental_invoices set provider_invoice_id = $2, updated_at = now() where id = $1',
    why: 'счёт ПЛАТФОРМЫ центру: правит платформенный администратор по праву platform.tenants.write'
  },
  {
    where:
      "modules/platform/rental-billing.service.ts::core.rental_invoices::update core.rental_invoices set status = 'paid', paid_at = now(), updated_at = now() where id = $1",
    why: 'отметка об оплате счёта платформы, см. выше'
  },
  {
    where:
      "modules/platform/retention-sweeper.service.ts::iam.sessions::delete from iam.sessions where ctid in ( select ctid from iam.sessions where (expires_at < now() - ($1 || ' days')::interval) or (revoked_at is not null and revoked_at < now() - ($1 || ' days')::interval) limit ${BATCH_SIZE} )",
    why: 'уборка по СРОКУ хранения идёт по всей платформе — это её работа, а не работа центра'
  },
  {
    where:
      "modules/platform/retention-sweeper.service.ts::iam.magic_link_tokens::delete from iam.magic_link_tokens where ctid in ( select ctid from iam.magic_link_tokens where created_at < now() - ($1 || ' days')::interval and (consumed_at is not null or expires_at < now()) limit ${BATCH_SIZE} )",
    why: 'уборка по сроку хранения по всей платформе, см. выше'
  },
  {
    where:
      "modules/platform/retention-sweeper.service.ts::audit.audit_log::delete from audit.audit_log where ctid in ( select ctid from audit.audit_log where created_at < now() - ($1 || ' days')::interval limit ${BATCH_SIZE} )",
    why: 'уборка журнала по сроку хранения по всей платформе, см. выше'
  },
  {
    where:
      'modules/communication/postgres-webinars.repository.ts::communication.webinar_participants::update communication.webinar_participants set attendance_status = $1, joined_at = coalesce($2::timestamptz, joined_at), left_at = coalesce($3::timestamptz, left_at), duration_seconds = coalesce($4, duration_seconds) where id = $5',
    why: 'правка строки участника по её собственному номеру; номер получен запросом строкой выше, где отбор по центру есть'
  },
  {
    where:
      'modules/communication/telegram/postgres-telegram-links.repository.ts::communication.telegram_links::delete from communication.telegram_links where chat_id = $1',
    why: 'привязка чата снимает ЛЮБУЮ прежнюю связь этого чата, в том числе в другом центре: чат принадлежит одному человеку, и оставить старую связь значит слать уведомления тому, кому чат больше не принадлежит'
  },
  {
    where:
      'modules/communication/postgres-webinars.repository.ts::communication.webinars::select * from communication.webinars where provider_session_id = $1 limit 1',
    why: 'вебхук площадки вебинаров приходит без арендатора: сессия ищется по внешнему номеру, центр берётся ИЗ НАЙДЕННОЙ записи'
  },
  {
    where:
      'modules/migration/backfill/backfill.service.ts::migration.backfill_items::select * from migration.backfill_items where run_id = $1 order by id desc limit $2',
    why: 'доливка данных МЕЖЦЕНТРОВАЯ по замыслу (сверка уровня платформы): арендатора у прогона нет, ручки закрыты общим секретом WorkerCallbackGuard, который при незаданном секрете отказывает'
  },
  {
    where:
      'modules/platform/rental-billing.service.ts::core.rental_invoices::select id from core.rental_invoices where number = $1',
    why: 'проверка неповторимости номера счёта ПЛАТФОРМЫ: номер сквозной по платформе, и искать его в границах одного центра значило бы выдать два счёта с одним номером'
  },
  {
    where:
      'modules/mvp/video/postgres-video-assets.repository.ts::learning.video_assets::select ${SELECT_COLUMNS} from learning.video_assets where provider_asset_id = $1',
    why: 'вебхук видеосервиса приходит без арендатора: запись ищется по внешнему номеру, центр берётся ИЗ НАЙДЕННОЙ записи'
  }
];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') && !full.includes('.test.')) out.push(full);
  }
  return out;
};

const rel = (file: string): string => relative(BACKEND_SRC, file).replace(/\\/g, '/');

/**
 * Текст выражения от открывающей скобки до её пары.
 *
 * Наивное «до первой закрывающей» обрывается на вложенном вызове (`ids.has(item.id)`), и
 * условие с арендатором, стоящее дальше, осталось бы незамеченным — сторож ругался бы на
 * верный код и его бы отключили.
 */
const argumentOf = (source: string, openParen: number): string => {
  let depth = 0;
  for (let i = openParen; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openParen, i + 1);
    }
  }
  return source.slice(openParen, openParen + 400);
};

describe('чтение из состояния центра отбирает по центру (режим ревизии)', () => {
  const reads: Array<{ where: string; expr: string }> = [];
  const pattern =
    /this\.state\.([A-Za-z0-9_]+)\s*\.\s*(?:filter|find|some|findIndex|findLast)\s*\(/g;

  for (const file of walk(resolve(BACKEND_SRC, 'modules'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const openParen = source.indexOf('(', match.index! + match[0].length - 1);
      const expr = argumentOf(source, openParen);
      reads.push({
        /*
         * Пробелы схлопываются: перенос строки не должен считаться другим выражением, иначе
         * переформатирование ломало бы реестр и его переставали бы поддерживать.
         */
        where: `${rel(file)}::${match[1]}::${expr.replace(/\s+/g, ' ')}`,
        expr
      });
    }
  }

  it('такие чтения вообще находятся — иначе сторож сторожит пустоту', () => {
    expect(reads.length).toBeGreaterThan(100);
  });

  it('каждое чтение отбирает по центру либо названо в реестре с причиной', () => {
    const allowed = new Set(STATE_READS_WITHOUT_TENANT.map((item) => item.where));
    const unscoped = [
      ...new Set(
        reads
          .filter((read) => !/tenantId/.test(read.expr))
          .map((read) => read.where)
          .filter((where) => !allowed.has(where))
      )
    ];
    expect(
      unscoped,
      'Появилось чтение из состояния центра без отбора по центру. Либо добавьте условие ' +
        '`item.tenantId === tenantId`, либо внесите его в STATE_READS_WITHOUT_TENANT с ' +
        'ответом: почему чужие записи сюда попасть не могут.'
    ).toEqual([]);
  });

  it('в реестре нет устаревших строк', () => {
    /* Иначе список живёт своей жизнью, и следующее такое чтение проскочит под чужим оправданием. */
    const known = new Set(reads.map((read) => read.where));
    const stale = STATE_READS_WITHOUT_TENANT.filter((item) => !known.has(item.where)).map(
      (item) => item.where
    );
    expect(stale, 'строка реестра больше ни к чему не относится — удалите её').toEqual([]);
  });
});

describe('запрос к базе — читающий и изменяющий — отбирает по центру (режим ревизии)', () => {
  /**
   * Таблицы, принадлежащие центру, выводятся ИЗ МИГРАЦИЙ — по столбцу `tenant_id`. Список
   * в коде сторожа отстал бы от базы при первой же новой таблице, и проверка молча перестала
   * бы что-либо значить.
   */
  const tenantTables = new Set<string>();
  for (const name of readdirSync(MIGRATIONS).sort()) {
    if (!name.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    for (const match of sql.matchAll(
      /CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\n\);/gi
    )) {
      if (/\btenant_id\b/i.test(match[2]!)) tenantTables.add(match[1]!.toLowerCase());
    }
    for (const match of sql.matchAll(
      /ALTER TABLE(?: IF EXISTS)?\s+([a-z_]+\.[a-z_]+)\s+ADD COLUMN(?: IF NOT EXISTS)?\s+tenant_id/gi
    )) {
      tenantTables.add(match[1]!.toLowerCase());
    }
  }

  const selects: Array<{ where: string; query: string }> = [];
  for (const file of walk(resolve(BACKEND_SRC))) {
    const source = readFileSync(file, 'utf8');
    /*
     * Запросы пишут и в обратных кавычках, и в обычных. Берём и те и другие, но требуем,
     * чтобы строка НАЧИНАЛАСЬ как запрос: иначе жадный разбор обратных кавычек склеивает
     * два несвязанных куска кода и выдаёт «запрос» длиной в половину файла — так один
     * настоящий запрос к вебинарам оказался спрятан внутри мусорной строки и не проверялся.
     */
    for (const match of source.matchAll(/`([^`]*?)`|'([^'\n]*?)'/gis)) {
      const query = (match[1] ?? match[2])!;
      /*
       * И читающие, и ИЗМЕНЯЮЩИЕ запросы. Чужая запись хуже чужого чтения: прочитанное можно
       * не показать, а изменённое уже изменено. Проверка одна и та же, поэтому разделять их
       * на два сторожа незачем.
       */
      if (!/^\s*(select|with|update|delete)\b/i.test(query)) continue;
      if (!/\b(?:from|update|into|join)\s+[a-z_]+\.[a-z_]+/i.test(query)) continue;
      const tables = new Set<string>();
      for (const one of query.matchAll(/\b(?:from|join|update|into)\s+([a-z_]+\.[a-z_]+)/gi)) {
        tables.add(one[1]!.toLowerCase());
      }
      /*
       * Ключ содержит САМ ЗАПРОС — по той же причине, что и у чтений из состояния: пара
       * «файл + таблица» выдавала бы оправдание всем будущим запросам к этой таблице в этом
       * файле. Подсаженная поломка «видео материала достаются по всем центрам» проходила
       * ровно так: у файла уже был оправдан вебхучный поиск по внешнему номеру.
       */
      const normalized = query.replace(/\s+/g, ' ').trim();
      for (const table of tables) {
        if (tenantTables.has(table)) {
          selects.push({ where: `${rel(file)}::${table}::${normalized}`, query });
        }
      }
    }
  }

  it('таблицы центра выводятся из миграций, а не записаны в тесте', () => {
    expect(tenantTables.size).toBeGreaterThan(50);
    expect(tenantTables.has('learning.enrollments')).toBe(true);
  });

  it('такие запросы вообще находятся', () => {
    expect(selects.length).toBeGreaterThan(80);
  });

  it('каждый запрос отбирает по центру либо назван в реестре с причиной', () => {
    const allowed = new Set(QUERIES_WITHOUT_TENANT.map((item) => item.where));
    const unscoped = [
      ...new Set(
        selects
          .filter((one) => !/tenant_id/i.test(one.query))
          .map((one) => one.where)
          .filter((where) => !allowed.has(where))
      )
    ];
    expect(
      unscoped,
      'Появился запрос к таблице центра без условия по tenant_id. Либо добавьте условие, ' +
        'либо внесите запрос в QUERIES_WITHOUT_TENANT с ответом: почему чужие строки сюда ' +
        'попасть не могут.'
    ).toEqual([]);
  });

  it('в реестре запросов нет устаревших строк', () => {
    const known = new Set(selects.map((one) => one.where));
    const stale = QUERIES_WITHOUT_TENANT.filter((item) => !known.has(item.where)).map(
      (item) => item.where
    );
    expect(stale, 'строка реестра больше ни к чему не относится — удалите её').toEqual([]);
  });

  it('у каждого исключения названа причина, а не просто место', () => {
    for (const item of [...STATE_READS_WITHOUT_TENANT, ...QUERIES_WITHOUT_TENANT]) {
      expect(item.why.length, `${item.where}: причина не названа`).toBeGreaterThan(30);
    }
  });
});
