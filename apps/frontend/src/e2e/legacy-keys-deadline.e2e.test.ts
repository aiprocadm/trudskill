import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';

/**
 * `BR-020`: окно двойного чтения ключей хранения закрывается по календарю — и не забывается.
 *
 * При ребрендинге ключи браузера и cookie переименовали (`cdoprof.*` → `trudskill.*`). Прямое
 * переименование выкинуло бы всех, кто вошёл, и сбросило бы выбранную тему, поэтому ТЗ
 * требует двух выкаток: сначала читаем оба имени и пишем новое (выкатка N, PR #537 от
 * 18.08.2026), а через 60 дней убираем чтение прежних (выкатка N+1).
 *
 * Проблема такого пункта в том, что он держится на памяти. Через два месяца никто не помнит
 * ни про какое окно; прежние имена остаются в коде навсегда, и вместе с ними — лишний путь
 * чтения в самом чувствительном месте (сессия и защита от подделки запроса).
 *
 * Поэтому срок живёт здесь. До 17.10.2026 сторож молчит и лишь следит, чтобы список прежних
 * ключей не разрастался. С 17.10.2026 он краснеет и называет поимённо, что удалить.
 *
 * **Решение о дате отсчёта (владелец делегировал агенту, 08.09.2026).** Runbook требует
 * считать 60 дней от выкатки в ПРОД, а не от вливания PR. Отдельной выкатки в прод у проекта
 * нет — стенд собирается из главной ветки, — поэтому за начало взята дата вливания PR #537.
 * Если выкатка в прод была позже, дату здесь надо сдвинуть: она в одном месте и подписана.
 */

/** Выкатка N — вливание PR #537. */
const WINDOW_OPENED = '2026-08-18';
/** ТЗ `BR-020` п. 2: «совместимость 60 дней (дольше самой длинной сессии с запасом)». */
const COMPAT_DAYS = 60;

const deadline = new Date(`${WINDOW_OPENED}T00:00:00Z`);
deadline.setUTCDate(deadline.getUTCDate() + COMPAT_DAYS);

/**
 * Прежние имена, которые читаются ради совместимости. Список закрытый: он же и есть работа
 * выкатки N+1 — что перечислено, то и удаляется.
 */
const LEGACY_KEYS: { key: string; file: string; what: string }[] = [
  {
    key: 'cdoprof.session.v1',
    file: fromApp('src', 'lib', 'auth', 'session-store.ts'),
    what: 'сессия в браузере'
  },
  {
    key: 'cdoprof_tenant_code',
    file: fromApp('src', 'lib', 'tenant', 'host-resolve.ts'),
    what: 'cookie с кодом учебного центра'
  },
  {
    key: 'cdoprof_refresh_token',
    file: join(APP_ROOT, '..', 'backend', 'src', 'modules', 'iam', 'auth-cookie.util.ts'),
    what: 'cookie обновления сессии'
  },
  {
    key: 'cdoprof_csrf_token',
    file: join(APP_ROOT, '..', 'backend', 'src', 'modules', 'iam', 'auth-cookie.util.ts'),
    what: 'cookie защиты от подделки запроса'
  },
  {
    key: 'cdoprof-ui-theme',
    file: fromPackages('ui', 'src', 'providers', 'theme-context.tsx'),
    what: 'выбранная тема оформления'
  }
];

const has = (entry: (typeof LEGACY_KEYS)[number]): boolean =>
  readFileSync(entry.file, 'utf8').includes(`'${entry.key}'`);

describe('BR-020 · окно совместимости ключей хранения', () => {
  it('список прежних ключей совпадает с кодом', () => {
    /*
     * Сверка в обе стороны. Ключ, которого в коде уже нет, — строка списка, вводящая в
     * заблуждение: выкатка N+1 будет считать работу несделанной. Ключ в коде без строки в
     * списке — прежнее имя, заведённое мимо решения: его никто не удалит, потому что о нём
     * не знают.
     */
    const missing = LEGACY_KEYS.filter((entry) => !has(entry)).map((entry) => entry.key);
    expect(missing, 'ключа нет в коде — уберите строку из списка').toEqual([]);
  });

  it('окно совместимости не просрочено', () => {
    const overdue = Date.now() >= deadline.getTime();
    const left = LEGACY_KEYS.filter(has).map(
      (entry) => `${entry.key} (${entry.what}) — ${entry.file.split('/').slice(-2).join('/')}`
    );
    expect(
      overdue ? left : [],
      `60 дней с выкатки N (${WINDOW_OPENED}) истекли ${deadline.toISOString().slice(0, 10)}. ` +
        'Пора выкатка N+1 по docs/REBRANDING_KEYS_ROLLOUT.md: убрать чтение и запись прежних ' +
        'имён из файлов ниже. Если выкатка N в прод была ПОЗЖЕ указанной даты — сдвиньте ' +
        'WINDOW_OPENED в этом файле, а не удаляйте проверку.'
    ).toEqual([]);
  });
});
