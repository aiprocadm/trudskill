import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Сторож эксплуатационных скриптов (ФТ-I4, Фаза 6 Task 4).
 *
 * Скрипты `infra/*.sh` — это не «просто bash»: от них зависит, останется ли у центра
 * хоть что-то после аварии. Прогонять их в тестах нельзя (нужны docker и живая база),
 * поэтому сторож закрепляет СВОЙСТВА, каждое из которых уже было нарушено или
 * стоило бы нам данных:
 *
 *  1. `--no-owner --no-privileges` у pg_dump. Без них дамп НЕ восстанавливается на
 *     чистом сервере: pg_dump пишет «сделать владельцем роль X», на новой машине такой
 *     роли нет, восстановление обрывается. Это не теория — так провалились ПЕРВЫЕ
 *     учения 2026-08-08, до правки формата.
 *  2. `ON_ERROR_STOP=1` при восстановлении. Без него psql проглатывает ошибки и выходит
 *     с кодом 0: «успешное» восстановление оставляет половину таблиц.
 *  3. Запись через временный файл. Перенаправление создаёт файл ДО запуска команды —
 *     сбой на середине оставляет обрезанный архив, неотличимый по имени от копии.
 *  4. Проверка целостности (`gzip -t`, контрольная сумма) и порога свободного места.
 */
const infraDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../../infra');

const read = (name: string): string => {
  const path = join(infraDir, name);
  expect(existsSync(path), `не найден ${path}`).toBe(true);
  return readFileSync(path, 'utf8');
};

describe('infra/backup.sh — снятие копии', () => {
  const script = read('backup.sh');

  it('дамп снимается переносимым: без владельцев и прав', () => {
    expect(script).toMatch(
      /pg_dump[^|]*--no-owner[^|]*--no-privileges|pg_dump[^|]*--no-privileges[^|]*--no-owner/
    );
  });

  it('топология не зашита: способ достучаться до базы берётся из переменной', () => {
    // Прежняя версия звала прод-compose, которого на стенде нет, — и там не работала.
    expect(script).toContain('ops_pg_exec');
    expect(script).not.toMatch(
      /pg_dump[\s\S]{0,80}docker compose -f infra\/docker-compose\.prod\.yml/
    );
  });

  it('файл становится копией только после проверки: временный файл + gzip -t + сумма', () => {
    expect(script).toContain('.part');
    expect(script).toMatch(/gzip -t/);
    expect(script).toMatch(/sha256sum/);
    // Переименование идёт ПОСЛЕ проверки целостности.
    expect(script.indexOf('gzip -t')).toBeLessThan(script.indexOf('mv "$db_part"'));
  });

  it('перед началом проверяется свободное место', () => {
    expect(script).toContain('ops_require_space');
  });

  it('пустой или крошечный дамп считается неудачей', () => {
    expect(script).toMatch(/db_bytes/);
  });

  it('пишется отметка об успехе — по ней сторож отличает свежую копию от протухшей', () => {
    expect(script).toContain('last-success');
  });

  it('строгий режим bash: ошибка в конвейере не проходит незамеченной', () => {
    expect(script).toContain('set -euo pipefail');
  });
});

describe('infra/restore-drill.sh — учения восстановления', () => {
  const script = read('restore-drill.sh');

  it('восстановление останавливается на первой ошибке', () => {
    expect(script).toContain('ON_ERROR_STOP=1');
  });

  it('учения идут в ОДНОРАЗОВОЙ базе, боевая не затрагивается', () => {
    expect(script).toMatch(/docker run -d --rm/);
    expect(script).toContain('trap cleanup EXIT');
  });

  it('проверяется не только «восстановилось без ошибок», но и что данные на месте', () => {
    for (const marker of [
      'schema_name in',
      'core.schema_migrations',
      'core.tenants',
      'iam.users'
    ]) {
      expect(script, marker).toContain(marker);
    }
  });

  it('замеряется фактическое время восстановления (RTO) и сравнивается с пределом', () => {
    expect(script).toContain('RTO');
    expect(script).toContain('RTO_BUDGET_SECONDS');
  });

  it('целостность файла проверяется ДО того, как поднимать базу', () => {
    expect(script.indexOf('sha256sum')).toBeLessThan(script.indexOf('docker run -d --rm'));
  });
});

describe('infra/backup-watchdog.sh — сторож свежести', () => {
  const script = read('backup-watchdog.sh');

  it('отсутствие копий — тревога, а не тишина', () => {
    expect(script).toMatch(/Резервных копий базы НЕТ/);
  });

  it('проверяются возраст, контрольная сумма и отметка об успехе', () => {
    expect(script).toContain('MAX_AGE_HOURS');
    expect(script).toContain('sha256sum');
    expect(script).toContain('last-success');
  });

  it('о проблемах сообщает ненулевым кодом возврата — иначе cron промолчит', () => {
    expect(script).toMatch(/exit 1/);
  });
});

describe('ротация журналов контейнеров', () => {
  it.each(['docker-compose.prod.yml', 'docker-compose.yml'])(
    '%s: у каждого сервиса задан предел размера журнала',
    (file) => {
      const compose = read(file);
      expect(compose).toContain('x-default-logging');
      // Считаем ТОЛЬКО блок services: на том же отступе живут `volumes:` и `networks:`,
      // и наивный поиск по отступу принял бы тома за сервисы.
      const servicesStart = compose.indexOf('\nservices:');
      expect(servicesStart, 'в файле нет блока services').toBeGreaterThan(-1);
      const rest = compose.slice(servicesStart + 1);
      const nextTopLevel = rest.slice(1).search(/^[a-z]/m);
      const servicesBlock = nextTopLevel === -1 ? rest : rest.slice(0, nextTopLevel + 1);
      const services = servicesBlock.match(/^ {2}[a-z0-9_-]+:$/gm) ?? [];
      const logging = servicesBlock.match(/logging: \*default-logging/g) ?? [];
      // Без предела json-файл растёт, пока не кончится диск: тогда Postgres встаёт
      // в read-only И бэкап не снимается — одновременно.
      expect(logging.length, `сервисов ${services.length}, с ротацией ${logging.length}`).toBe(
        services.length
      );
    }
  );
});

/**
 * Сторож скрипта тревог (ФТ-I2, Фаза 6 Task 6).
 *
 * Тревоги — это последняя линия: если они молчат по ошибке, авария будет обнаружена
 * звонком клиента. Закрепляем свойства, без которых скрипт врёт молчанием:
 *  - `set -e` НЕ включён: упавшая первая проверка не должна отменять остальные;
 *  - каждая проверка увеличивает счётчик проблем и код выхода становится 1 —
 *    иначе cron считает запуск успешным и никто ничего не узнает;
 *  - у сетевых запросов есть предел ожидания: подвисший curl съедает следующий запуск.
 */
describe('infra/ops-alerts.sh — сигналы аварий', () => {
  const script = read('ops-alerts.sh');

  it('одна упавшая проверка не отменяет остальные', () => {
    expect(script).toContain('set -uo pipefail');
    expect(script).not.toMatch(/^set -e(?:uo)?[^\S\n]*$/m);
  });

  it('проблемы дают ненулевой код выхода — молчание cron означает «всё в порядке»', () => {
    expect(script).toMatch(/if \[ "\$problems" -gt 0 \]/);
    expect(script).toContain('exit 1');
  });

  it('у сетевых проверок есть предел ожидания', () => {
    // Только настоящие вызовы: строки-комментарии про curl проверять нечего.
    const curls = (script.match(/^[^#\n]*\bcurl [^\n]*/gm) ?? []).filter(
      (line) => !line.trimStart().startsWith('#')
    );
    expect(curls.length).toBeGreaterThanOrEqual(2);
    for (const call of curls) {
      expect(call, `curl без --max-time: ${call}`).toContain('--max-time');
    }
  });

  it('проверяются все семь аварий: бэкенд, воркер, очередь, планировщики, копия, диск, 5xx', () => {
    expect(script).toContain('/health/ready');
    expect(script).toContain('/healthz');
    expect(script).toContain('document_tasks_backlog');
    expect(script).toContain('scheduler_overdue');
    expect(script).toMatch(/db-\*\.sql\.gz/);
    expect(script).toContain('df -P');
    expect(script).toContain('http_requests_total');
  });

  it('всплеск 5xx считается по приросту, а не по общему счётчику', () => {
    // Счётчик с момента старта растёт вечно: по нему «сломалось сейчас» неотличимо от
    // «сломалось месяц назад». Поэтому скрипт помнит прошлое значение.
    expect(script).toContain('STATE_FILE');
    expect(script).toMatch(/delta=\$\(\(errors_now - errors_prev\)\)/);
  });

  it('зависший воркер (503) отличается от умершего — это разные поломки', () => {
    expect(script).toMatch(/503\)/);
  });
});

/**
 * Сторож живости воркера (ФТ-I1, Фаза 6 Task 5).
 *
 * Воркер был единственным сервисом без проверки живости: умерший выглядел как живой,
 * очередь просто копилась. Проверка не должна исчезнуть при следующей правке compose.
 */
describe('infra/docker-compose.prod.yml — живость воркера', () => {
  const compose = read('docker-compose.prod.yml');
  const workerBlock = compose.slice(
    compose.indexOf('\n  worker:'),
    compose.indexOf('\n  frontend:')
  );

  it('у воркера есть healthcheck на /healthz', () => {
    expect(workerBlock).toContain('healthcheck:');
    expect(workerBlock).toContain('/healthz');
  });

  it('порт служебной ручки берётся из окружения, а не зашит', () => {
    expect(workerBlock).toContain('WORKER_HEALTH_PORT');
  });

  it('журналы всех сервисов ротируются', () => {
    const servicesBlock = compose.slice(
      compose.indexOf('\nservices:'),
      compose.indexOf('\nvolumes:')
    );
    const serviceCount = (servicesBlock.match(/^ {2}[a-z][a-z0-9-]*:$/gm) ?? []).length;
    const loggingCount = (servicesBlock.match(/logging: \*default-logging/g) ?? []).length;
    expect(loggingCount).toBe(serviceCount);
  });
});

/**
 * Несколько экземпляров бэкенда (§12.1, 2026-08-09).
 *
 * Замер показал: под нагрузкой в 50 сессий бэкенд занимает 94% ОДНОГО ядра при восьми на
 * машине — Node обрабатывает запросы по очереди в одном потоке. Лечится не кодом, а
 * запуском нескольких копий за прокси. Свойства ниже — то, без чего это молча не работает.
 */
describe('масштабирование бэкенда за прокси', () => {
  const caddyfile = read('Caddyfile');
  const compose = read('docker-compose.prod.yml');

  it('прокси ищет экземпляры динамически, а не запоминает адрес при старте', () => {
    // Со статическим адресом Caddy разрешает имя ОДИН раз: добавленные позже копии
    // никогда не получат ни одного запроса, и масштабирование окажется бутафорией.
    expect(caddyfile).toContain('dynamic a');
    expect(caddyfile).toContain('name backend');
  });

  it('запросы раскладываются по наименее занятому экземпляру', () => {
    expect(caddyfile).toContain('lb_policy least_conn');
  });

  it('неотвечающий экземпляр выводится из ротации', () => {
    expect(caddyfile).toContain('health_uri /api/v1/health/live');
  });

  it('порт бэкенда наружу не публикуется — иначе вторая копия не поднимется', () => {
    const backendBlock = compose.slice(
      compose.indexOf('\n  backend:'),
      compose.indexOf('\n  realtime:')
    );
    expect(backendBlock).not.toMatch(/^\s+ports:/m);
  });

  it('у бэкенда нет фиксированного имени контейнера — оно мешает масштабированию', () => {
    expect(compose).not.toContain('container_name');
  });
});
