import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Обратная сторона `permission-surface.isolation.test.ts` (ФТ-D1 / ФТ-G1).
 *
 * Сосед проверяет: «у ручки есть право». Здесь — противоположное направление:
 *
 *   **у права есть тот, кто его проверяет.**
 *
 * Право, которое выдаётся ролям миграцией и не проверяется НИКЕМ, — это обещание без
 * исполнителя. Роль выглядит настроенной, администратор видит у себя полномочие, а
 * возможности, которую оно охраняет, в продукте не существует. Обе стороны нужны: односторонний
 * сторож ловит только лишние двери и слеп к дверям, к которым не приделали проём.
 *
 * Так и нашлись два дефекта (журнал 309): `sms.configure` и `video.configure` выдавались
 * администрации миграциями `0068` и `0063`, службы настроек с методом `save()` были написаны
 * и покрыты тестами, репозитории заведены на оба вида хранилища — а ручки, из которой этот
 * `save()` вызывается, не существовало. Значение по умолчанию — «выключено, поставщик noop»,
 * поэтому второй канал доставки по СМС (ФТ-C1.3) и подключение видеосервиса нельзя было
 * включить иначе как правкой строки прямо в базе. Соседние контуры (вебинары, платежи)
 * построены полностью, включая ручки под `webinars.configure` / `payments.configure`.
 *
 * Проверено подсадным нарушителем: снятие `@RequirePermissions('sms.configure')` роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = resolve(HERE, '../../modules');
const MIGRATIONS = resolve(HERE, '../../../migrations');

interface EnforcedElsewhere {
  /** Код права ровно как в миграции. */
  code: string;
  /** Кто проверяет его вместо декоратора на ручке. */
  why: string;
}

/**
 * Права, которые проверяются НЕ декоратором. Реестр решений, а не способ погасить красный тест:
 * каждая строка отвечает на вопрос «кто именно его проверяет и где».
 */
const ENFORCED_ELSEWHERE: ReadonlyArray<EnforcedElsewhere> = [
  {
    code: 'assessment.read.cross_learner',
    why: 'проверяется в mvp.service (защита от чтения чужих попыток), а не на ручке: одна и та же ручка отдаёт свои данные без права и чужие — с ним'
  },
  {
    code: 'learners.act_as',
    why: 'проверяется в mvp.service при действии за слушателя; помечает запись журнала metadata.delegated'
  }
];

/** Коды прав, заводимых миграциями в `iam.permissions`. */
const seededPermissions = (): string[] => {
  const codes = new Set<string>();
  for (const entry of readdirSync(MIGRATIONS)) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(resolve(MIGRATIONS, entry), 'utf8');
    // Кортежи ('p_код', 'домен.действие', 'описание') внутри вставки в iam.permissions.
    for (const statement of sql.split(/insert\s+into\s+iam\.permissions/i).slice(1)) {
      const body = statement.split(';')[0] ?? '';
      for (const tuple of body.matchAll(/\(\s*'[^']+'\s*,\s*'([^']+)'\s*,/g)) {
        const code = tuple[1];
        if (code && /^[a-z_]+(\.[a-z_]+)+$/.test(code)) codes.add(code);
      }
    }
  }
  return [...codes].sort();
};

const controllers = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...controllers(full));
      continue;
    }
    if (entry.endsWith('.controller.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

/** Коды прав, которых требует хотя бы одна ручка. */
const permissionsRequiredByHandlers = (): Set<string> => {
  const required = new Set<string>();
  for (const file of controllers(MODULES)) {
    const source = readFileSync(file, 'utf8');
    for (const call of source.matchAll(/RequirePermissions\(([^)]*)\)/g)) {
      for (const literal of (call[1] ?? '').matchAll(/'([^']+)'/g)) {
        if (literal[1]) required.add(literal[1]);
      }
    }
  }
  return required;
};

describe('право проверяется или объяснено, кем оно проверяется вместо ручки', () => {
  it('у каждого выдаваемого права есть тот, кто его проверяет', () => {
    const required = permissionsRequiredByHandlers();
    const explained = new Set(ENFORCED_ELSEWHERE.map((item) => item.code));

    const unenforced = seededPermissions().filter(
      (code) => !required.has(code) && !explained.has(code)
    );

    expect(
      unenforced,
      'Право выдаётся ролям миграцией, но его не проверяет ни одна ручка. Либо возможность, ' +
        'которую оно охраняет, не доведена до API (право обещает то, чего нет), либо право ' +
        'проверяется в сервисе — тогда внесите его в ENFORCED_ELSEWHERE с ответом, ГДЕ именно.'
    ).toEqual([]);
  });

  it('реестр не устарел: записанное право существует и вправду не проверяется ручкой', () => {
    const seeded = new Set(seededPermissions());
    const required = permissionsRequiredByHandlers();

    const vanished = ENFORCED_ELSEWHERE.filter((item) => !seeded.has(item.code)).map((i) => i.code);
    expect(vanished, 'право из реестра больше не выдаётся миграциями — уберите строку').toEqual([]);

    const nowOnHandler = ENFORCED_ELSEWHERE.filter((item) => required.has(item.code)).map(
      (i) => i.code
    );
    expect(
      nowOnHandler,
      'право теперь проверяется ручкой — уберите строку, иначе реестр вводит в заблуждение'
    ).toEqual([]);
  });

  it('у каждой записи реестра есть внятное обоснование', () => {
    const weak = ENFORCED_ELSEWHERE.filter((item) => item.why.trim().length < 12).map(
      (i) => i.code
    );
    expect(weak, 'запись без объяснения — это отложенный дефект, а не решение').toEqual([]);
  });

  it('инвентарь прав вообще читается', () => {
    // Страховка от немого сторожа: если разбор миграций сломается, список станет пустым
    // и тест выше позеленеет ни на чём.
    expect(seededPermissions().length).toBeGreaterThan(50);
    expect(permissionsRequiredByHandlers().size).toBeGreaterThan(50);
    expect(MODULES.split(sep).length).toBeGreaterThan(1);
  });
});
