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
