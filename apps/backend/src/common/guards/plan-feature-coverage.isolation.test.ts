import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { KNOWN_PLAN_FEATURES } from '../../modules/platform/platform-plans.service.js';

/**
 * Четвёртый сторож семейства «объявлено — кто это исполняет»: **возможность тарифа кем-то
 * проверяется.**
 *
 * Тариф объявлял `proctoring` / `scorm` / `api` / `webinars`: флаги хранились в
 * `core.plans.features`, разбирались, отдавались ручкой платформы и показывались — и не
 * проверялись НИКЕМ (журнал 325). Центр на тарифе без прокторинга пользовался им свободно.
 * Это тот же класс, что записи 306/307 про лимиты, только про возможности, а не про числа.
 *
 * Родственники: `permission-coverage` (право), `env-coverage` (переменная окружения),
 * `contract-routes` (операция контракта). Вопрос один и тот же, предмет разный.
 *
 * Проверено подсадным нарушителем: новая возможность в списке без гейта роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');

interface EnforcedElsewhere {
  feature: string;
  why: string;
}

/**
 * Возможности, которые проверяются НЕ гейтом `assertFeature`. Реестр решений, а не способ
 * погасить красный тест: каждая строка отвечает, кто именно и где её соблюдает.
 */
const ENFORCED_ELSEWHERE: ReadonlyArray<EnforcedElsewhere> = [];

const sources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sources(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

/** Возможности, для которых где-то стоит гейт. */
const gatedFeatures = (): Set<string> => {
  const gated = new Set<string>();
  for (const file of sources(BACKEND_SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/assertFeature\([^,)]+,\s*'([a-z_]+)'/g)) {
      if (match[1]) gated.add(match[1]);
    }
  }
  return gated;
};

describe('возможность тарифа объявлена — её кто-то соблюдает', () => {
  it('у каждой объявленной возможности есть гейт', () => {
    const gated = gatedFeatures();
    const explained = new Set(ENFORCED_ELSEWHERE.map((item) => item.feature));

    const unenforced = KNOWN_PLAN_FEATURES.filter(
      (feature) => !gated.has(feature) && !explained.has(feature)
    );

    expect(
      unenforced,
      'Тариф объявляет возможность, которую не проверяет ни один гейт. Центр на тарифе без ' +
        'неё пользуется ею свободно, а экран честно показывает «не входит» — обещание без ' +
        'исполнения. Либо поставьте `assertFeature` на вход в возможность, либо уберите её ' +
        'из `KNOWN_PLAN_FEATURES`, либо внесите в ENFORCED_ELSEWHERE с ответом, кто её ' +
        'соблюдает вместо гейта.'
    ).toEqual([]);
  });

  it('реестр не устарел', () => {
    const known = new Set<string>(KNOWN_PLAN_FEATURES);
    const vanished = ENFORCED_ELSEWHERE.filter((item) => !known.has(item.feature)).map(
      (i) => i.feature
    );
    expect(vanished, 'возможности больше нет в тарифе — уберите строку из реестра').toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустой список возможностей или пустой список гейтов
    // сделали бы проверку выше зелёной ни на чём.
    expect(KNOWN_PLAN_FEATURES.length).toBeGreaterThan(2);
    expect(gatedFeatures().size).toBeGreaterThan(2);
  });
});
