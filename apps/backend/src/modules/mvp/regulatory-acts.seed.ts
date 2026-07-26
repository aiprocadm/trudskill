import type { RegulatoryAct } from './mvp.types.js';

/**
 * Global lookup нормативных актов — зеркало seed из migration 0030.
 * Используется как DTO-каталог для UI (мульти-селект в форме программы курса).
 * Postgres-implementation должна читать из `lookup.regulatory_acts` напрямую;
 * в in-memory режиме храним константу здесь.
 *
 * Вынесено из `mvp.service.ts` в отдельный файл (Фаза 1 Task 4): каталог нужен ещё и
 * сборщику переменных документов, а прямой импорт из `mvp.service.ts` дал бы цикл
 * (тот сам импортирует documents).
 */
export const REGULATORY_ACTS_SEED: RegulatoryAct[] = [
  {
    code: 'PP_2464_2022',
    shortName: 'ПП 2464',
    fullName:
      'Постановление Правительства РФ от 24.12.2022 №2464 «О порядке обучения по охране труда»',
    issuingAuthority: 'Правительство РФ',
    issuedAt: '2022-12-24',
    appliesToVerticals: ['ot'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'PRIKAZ_26N_2024',
    shortName: 'Приказ Минтруда 26н',
    fullName: 'Приказ Минтруда РФ от 17.01.2024 №26н',
    issuingAuthority: 'Минтруд России',
    issuedAt: '2024-01-17',
    appliesToVerticals: ['ot'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'FZ_116_1997',
    shortName: 'ФЗ-116',
    fullName:
      'Федеральный закон от 21.07.1997 №116-ФЗ «О промышленной безопасности опасных производственных объектов»',
    issuingAuthority: 'Государственная Дума РФ',
    issuedAt: '1997-07-21',
    appliesToVerticals: ['pb'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'PP_2168_2022',
    shortName: 'ПП 2168',
    fullName:
      'Постановление Правительства РФ от 29.11.2022 №2168 «О порядке аттестации в области промышленной безопасности»',
    issuingAuthority: 'Правительство РФ',
    issuedAt: '2022-11-29',
    appliesToVerticals: ['pb'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'PRIKAZ_707N_2015',
    shortName: 'Приказ Минздрава 707н',
    fullName: 'Приказ Минздрава РФ от 08.10.2015 №707н',
    issuingAuthority: 'Минздрав России',
    issuedAt: '2015-10-08',
    appliesToVerticals: ['nmo'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  },
  {
    code: 'FZ_273_2012_ART_196',
    shortName: 'ФЗ-273 ст.196',
    fullName: 'Федеральный закон от 29.12.2012 №273-ФЗ «Об образовании в РФ», ст. 196 — ДПО',
    issuingAuthority: 'Государственная Дума РФ',
    issuedAt: '2012-12-29',
    appliesToVerticals: ['ot', 'pb', 'nmo', 'emergency', 'other'],
    isActive: true,
    createdAt: '2026-05-22T00:00:00.000Z'
  }
];
