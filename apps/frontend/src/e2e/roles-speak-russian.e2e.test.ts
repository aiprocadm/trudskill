import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import { ROLE_PERMISSIONS } from './role-permissions.fixture';
import { roleBlueprints } from '../features/navigation/role-blueprints';
import { ROLE_NAMES_RU } from '../features/texts/roles.ru';

/**
 * Словарь ролей на русском (ТЗ «Стабилизация, UX и развитие», 4.1 / Я1, решение Р1).
 *
 * **Как было.** Одна роль звалась тремя способами: «Manager» в выпадающем списке (имя из посева
 * базы, ручка `/roles` отдаёт как есть), «Менеджер» в шапке (чертёж роли на фронте),
 * «руководитель» в документации. В одном списке стояли «Представитель заказчика», «Учащийся»,
 * «Manager», «Methodist», «Platform admin», «Преподаватель», «Tenant admin». Представителю
 * заказчика профиль печатал код `counterparty_rep` — имени у него не было вовсе.
 *
 * **Критерий приёмки ТЗ дословно:** «Grep по собранной сборке: строк Manager, Methodist,
 * Platform admin, Tenant admin в пользовательских текстах нет». Сборки у теста нет — есть
 * исходники, из которых она собирается, и ВСЕ источники имён: словарь, чертежи, посев базы
 * (миграция), запасной посев бэкенда, документ ролей. Сторож держит их равными словарю.
 */

/** Решение Р1 дословно; коды — из живой базы (`customer` из ТЗ в базе зовётся `counterparty_rep`). */
const DECISION_P1: Record<string, string> = {
  platform_admin: 'Администратор платформы',
  tenant_admin: 'Администратор центра',
  manager: 'Руководитель',
  methodist: 'Методист',
  teacher: 'Преподаватель',
  learner: 'Слушатель',
  counterparty_rep: 'Представитель заказчика'
};

const ROOTS = [
  fromApp('src', 'features'),
  fromApp('src', 'widgets'),
  fromApp('src', 'components'),
  fromApp('app'),
  fromPackages('ui', 'src')
];
const BACKEND_MODULES = fromApp('..', 'backend', 'src', 'modules');
const MIGRATION = fromApp('..', 'backend', 'migrations', '0096_iam_role_names_ru.sql');
const IAM_SERVICE = fromApp('..', 'backend', 'src', 'modules', 'iam', 'services', 'iam.service.ts');
const ROLES_DOC = fromApp('..', '..', 'docs', 'ia', 'roles.md');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      /*
       * Файлы стилей — CSS в строке-шаблоне: их комментарии `stripComments` не снимает (они
       * внутри строки), а текста для человека там нет. Первый прогон споткнулся о «экран
       * ученика» в комментарии к сетке.
       */
      if (entry === 'styles' && full.includes('/packages/ui/src/')) continue;
      collect(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');

/*
 * Латинские имена ищутся только там, где они — текст для человека: внутри строки или между
 * тегами. Иначе сторож споткнётся о `SessionManager` и `managerRole`. Русские варианты — где
 * угодно: кириллица в коде бывает только в тексте для человека (комментарии сняты).
 */
const LATIN_ROLE = /(['"`>])\s*(Manager|Methodist|Platform admin|Tenant admin)\s*(['"`<.,:])/;
const RUSSIAN_VARIANT = /Учащ[а-яё]+|Менеджер[а-яё]*|[Уу]ченик[а-яё]*/;

describe('роли говорят по-русски (ТЗ 4.1, решение Р1)', () => {
  it('словарь повторяет решение Р1 дословно и покрывает ровно живые роли', () => {
    expect(ROLE_NAMES_RU).toEqual(DECISION_P1);
    expect(
      Object.keys(ROLE_NAMES_RU).sort(),
      'набор ролей — из живой базы (role-permissions.fixture.ts): новая роль без имени или имя ' +
        'без роли — оба случая дефект'
    ).toEqual(Object.keys(ROLE_PERMISSIONS).sort());
  });

  it('чертёж роли берёт имя из словаря, а не хранит своё', () => {
    for (const blueprint of roleBlueprints) {
      expect(blueprint.displayName, blueprint.role).toBe(DECISION_P1[blueprint.role]);
    }
    const source = stripComments(
      readFileSync(fromApp('src', 'features', 'navigation', 'role-blueprints.ts'), 'utf8')
    );
    expect(
      /displayName:\s*'/.test(source),
      'имя роли в чертеже строкой — это второй словарь, и он разойдётся с первым'
    ).toBe(false);
  });

  it('ни один экран не называет роль словом не из словаря', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const latin = LATIN_ROLE.exec(source);
      if (latin) offenders.push(`${rel(file)}: «${latin[2]}»`);
      const russian = RUSSIAN_VARIANT.exec(source);
      if (russian) offenders.push(`${rel(file)}: «${russian[0]}»`);
    }
    expect(
      offenders,
      'у роли одно имя (Р1): «Руководитель», а не «Менеджер»; «Слушатель», а не «Учащийся» и не «ученик»'
    ).toEqual([]);
  });

  it('список пользователей и фильтр называют роль по коду, а не полем name из базы', () => {
    const source = stripComments(
      readFileSync(fromApp('src', 'features', 'users', 'users-screens.tsx'), 'utf8')
    );
    expect(/roleNameRu\(/.test(source), 'экран обязан спрашивать имя у словаря').toBe(true);
    expect(
      /\broleItem\.name\b|\bitem\.name\s*\|\|\s*item\.code\b/.test(source),
      'поле name из базы — это посев, а не словарь: стенд мог его ещё не получить'
    ).toBe(false);
  });

  it('профиль и шапка называют роль словарём — и представителя заказчика тоже', () => {
    const profile = stripComments(
      readFileSync(fromApp('src', 'components', 'profile-card.tsx'), 'utf8')
    );
    expect(/roleNamesRu\(/.test(profile)).toBe(true);
    expect(
      /roles\?\.join\(/.test(profile),
      'коды ролей через запятую — это `counterparty_rep` на экране'
    ).toBe(false);
    const shell = stripComments(
      readFileSync(fromApp('src', 'widgets', 'shell', 'app-shell.tsx'), 'utf8')
    );
    expect(/roleNamesRu\(/.test(shell), 'у роли без чертежа тоже есть имя').toBe(true);
  });

  it('посев базы выровнен по тому же словарю (миграция 0096)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const seeded = Object.fromEntries(
      [...sql.matchAll(/UPDATE iam\.roles SET name = '([^']+)' WHERE code = '([^']+)'/g)].map(
        (m) => [m[2]!, m[1]!]
      )
    );
    expect(seeded).toEqual(DECISION_P1);
  });

  it('запасной посев бэкенда (режим в памяти) называет роли так же', () => {
    const source = stripComments(readFileSync(IAM_SERVICE, 'utf8'));
    const start = source.indexOf('fallbackRoles');
    const end = source.indexOf('fallbackPermissions', start);
    expect(start, 'запасной посев ролей обязан существовать').toBeGreaterThan(-1);
    const block = source.slice(start, end);
    const pairs = [...block.matchAll(/code: '([a-z_]+)',\s*name: '([^']+)'/g)];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, code, name] of pairs) {
      expect(name, code).toBe(DECISION_P1[code!]);
    }
  });

  it('сообщения сервера не зовут слушателя учеником', () => {
    const offenders: string[] = [];
    for (const file of collect(BACKEND_MODULES)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const hit = /message:\s*'[^']*[Уу]ченик/.exec(source);
      if (hit) offenders.push(rel(file));
    }
    expect(offenders, 'человек читает это сообщение на экране — слово из словаря').toEqual([]);
  });

  it('документ ролей называет роли словарём', () => {
    const doc = readFileSync(ROLES_DOC, 'utf8');
    for (const [code, name] of Object.entries(DECISION_P1)) {
      expect(doc, `${code} → «${name}»`).toContain(`### ${name} (\`${code}\`)`);
    }
  });
});
