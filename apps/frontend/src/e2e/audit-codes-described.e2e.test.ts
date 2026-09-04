import { describe, expect, it } from 'vitest';

import { auditInventory } from './audit-inventory';
import { describeAction, domainLabel, entityLabel } from '../features/audit/labels';

/**
 * Сторож класса «объявлено — кто это исполняет»: **каждое действие журнала, которое пишет
 * бэкенд, человек читает по-русски.**
 *
 * Бэкенд пишет в `audit.audit_log` код действия (`learning.learner_created`) и код типа
 * объекта (`learning.group`). Экран «Журнал действий» (`features/audit/audit-screen.tsx`)
 * показывает их через словарь `features/audit/labels.ts`: `describeAction` — колонка «Что»,
 * `entityLabel` — «Над чем», `domainLabel` — «Раздел». Незнакомый код словарь возвращает
 * как есть, и человек читает `auth.login`, `iam.user`, `learner.personal_data_accessed` —
 * сырой код вместо фразы, против правила продукта №2 и TXT-006 (журнал 346).
 *
 * Инвариант: у каждого кода действия и типа объекта, который бэкенд ПИШЕТ, словарь ЗНАЕТ
 * фразу — на русском, без латиницы, точек и подчёркиваний. Список кодов собирается со
 * ВСЕХ вызовов аудита в исходниках бэкенда (`e2e/audit-inventory.ts`), включая обёртки
 * и тернарники; вызов, форму которого инвентарь не разобрал, роняет отдельный тест —
 * сторож не молчит на новой форме записи.
 *
 * Сторож живёт во фронте, хотя читает бэкенд: он должен вызывать НАСТОЯЩИЙ словарь,
 * а не его копию.
 */

const inventory = auditInventory();

const RUSSIAN_PHRASE = /^[А-ЯЁа-яё0-9 ,:;«»()\-—–]+$/;

const where = (places: string[]): string => places.slice(0, 3).join(', ');

describe('каждое действие журнала, которое пишет бэкенд, человек читает по-русски', () => {
  it('инвентарь разобрал каждый вызов аудита — незнакомых форм записи нет', () => {
    expect(
      inventory.unresolved.map((u) => `${u.location} ${u.callee}(…)`),
      'У этих вызовов аудита инвентарь не нашёл код действия: ни литерала, ни тернарника, ' +
        'ни переменной с `const` в том же файле. Либо запишите код литералом, либо научите ' +
        '`e2e/audit-inventory.ts` новой форме — но не оставляйте вызов неучтённым.'
    ).toEqual([]);
  });

  it('инвентарь не пуст — вызовов, кодов и типов объектов не меньше, чем было', () => {
    // Страховка от немого сторожа: на 2026-09-04 — 185 вызовов, 170 кодов, 48 типов объектов.
    expect(inventory.calls).toBeGreaterThanOrEqual(180);
    expect(inventory.actions.size).toBeGreaterThanOrEqual(160);
    expect(inventory.entityTypes.size).toBeGreaterThanOrEqual(40);
    // Знакомые коды — на месте: инвентарь читает те файлы, что нужно.
    expect(inventory.actions.has('auth.login')).toBe(true);
    expect(inventory.actions.has('learning.learner_created')).toBe(true);
    expect(inventory.entityTypes.has('learning.group')).toBe(true);
  });

  it('у каждого кода действия есть русская фраза для колонки «Что»', () => {
    const raw = [...inventory.actions]
      .filter(([code]) => {
        const phrase = describeAction(code);
        return phrase === code || !RUSSIAN_PHRASE.test(phrase);
      })
      .map(([code, places]) => `${code} → «${describeAction(code)}» (${where(places)})`)
      .sort();
    expect(
      raw,
      'Эти действия бэкенд пишет в журнал, а экран «Журнал действий» покажет их кодом. ' +
        'Добавьте фразу в `features/audit/labels.ts`: объект в OBJECTS и глагол в VERBS для ' +
        'правильных кодов `<раздел>.<объект>_<глагол>`, либо целую фразу в PHRASES для ' +
        'неправильных (`auth.login`, `documents.task.retried`).'
    ).toEqual([]);
  });

  it('у каждого типа объекта есть русское название для колонки «Над чем»', () => {
    const raw = [...inventory.entityTypes]
      .filter(([type]) => {
        const label = entityLabel(type);
        return label === type || !RUSSIAN_PHRASE.test(label);
      })
      .map(([type, places]) => `${type} → «${entityLabel(type)}» (${where(places)})`)
      .sort();
    expect(
      raw,
      'Эти типы объектов бэкенд пишет с префиксом раздела (`learning.group`), а словарь ' +
        'знает только голое имя — колонка «Над чем» показывает код. Добавьте название в ' +
        '`features/audit/labels.ts` (ENTITY_LABELS или OBJECTS).'
    ).toEqual([]);
  });

  it('у каждого раздела журнала есть русское название', () => {
    const domains = new Set([...inventory.actions.keys()].map((code) => code.split('.')[0]!));
    const raw = [...domains]
      .filter((domain) => {
        const label = domainLabel(`${domain}.x`);
        return label === domain || !RUSSIAN_PHRASE.test(label);
      })
      .sort();
    expect(
      raw,
      'Разделы, которые бэкенд пишет в код действия, а фильтр «Раздел» на экране не знает: ' +
        'добавьте в DOMAIN_LABELS `features/audit/labels.ts`.'
    ).toEqual([]);
  });
});
