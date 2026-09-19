import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEP_META,
  REQUIRED_STEP_IDS,
  canIssueDocuments,
  requiredDone
} from '../features/onboarding/types';

import type { OnboardingStatusDto } from '../features/onboarding/types';

/**
 * Мастер первого запуска по решению Р6 (ТЗ «Стабилизация, UX и развитие», 8.2).
 *
 * **Как было.** В мастере было ШЕСТЬ шагов, а решение владельца Р6 называет семь, из них пять
 * обязательных, и список не совпадал: не хватало **нумератора документов** (без правила у
 * документа нет номера — того, по чему его находят в реестре) и **подписи с печатью**, зато
 * был шаг «Логотип и цвета», которого Р6 не называет. Оформление убрано: это предмет 13.3,
 * а не условие начала работы; иначе индикатор «5 из 7» врал бы про восемь (журнал 528).
 *
 * **Что закреплено.**
 *
 * 1. Шаги — ровно те, что назвало решение Р6, и обязательные из них те же пять.
 * 2. «Готов к работе» считается по ОБЯЗАТЕЛЬНЫМ шагам, а не по всем семи.
 * 3. У каждого шага есть место, куда идти, и право, которым он делается.
 */

const statusOf = (done: string[]): OnboardingStatusDto => ({
  steps: ONBOARDING_STEP_IDS.map((id) => ({ id, done: done.includes(id) })),
  doneCount: done.length,
  totalCount: ONBOARDING_STEP_IDS.length,
  nextStepId: null,
  ready: false
});

describe('мастер первого запуска следует решению Р6 (ТЗ 8.2)', () => {
  it('шагов семь — как назвало решение', () => {
    expect(ONBOARDING_STEP_IDS).toHaveLength(7);
    expect(ONBOARDING_STEP_IDS, 'нумератор — обязательный шаг Р6').toContain('numbering');
    expect(ONBOARDING_STEP_IDS, 'подпись и печать — необязательный шаг Р6').toContain('signature');
  });

  it('обязательные шаги — ровно пять, названные Р6', () => {
    expect([...REQUIRED_STEP_IDS].sort()).toEqual([
      'commission',
      'license',
      'numbering',
      'requisites',
      'template'
    ]);
  });

  it('«можно работать» считается по обязательным, а не по всем', () => {
    /*
     * Центр без логотипа и без первого курса документы выдавать может; центр без нумератора —
     * нет. Смешать эти счёта значило бы врать человеку в обе стороны.
     */
    const allRequired = statusOf([...REQUIRED_STEP_IDS]);
    expect(canIssueDocuments(allRequired)).toBe(true);
    expect(requiredDone(allRequired)).toEqual({ done: 5, total: 5 });

    const withoutNumbering = statusOf(
      REQUIRED_STEP_IDS.filter((id) => id !== 'numbering').concat(['course', 'signature'])
    );
    expect(canIssueDocuments(withoutNumbering), 'без номера документ недействителен').toBe(false);
    expect(requiredDone(withoutNumbering)).toEqual({ done: 4, total: 5 });
  });

  it('у каждого шага есть место и право', () => {
    for (const id of ONBOARDING_STEP_IDS) {
      const meta = ONBOARDING_STEP_META[id];
      expect(meta?.title, `${id}: у шага должно быть название`).toBeTruthy();
      expect(meta?.href, `${id}: шаг делается на экране, а не в воздухе`).toMatch(/^\//);
      expect(
        meta?.requiredPermission,
        `${id}: право ДЕЙСТВИЯ, иначе мастер скажет «можно», а ручка ответит отказом`
      ).toBeTruthy();
    }
  });

  it('подсказка нумератора объясняет, зачем он нужен', () => {
    expect(ONBOARDING_STEP_META.numbering?.hint).toContain('номер');
  });

  it('план фазы 8 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-19-stabux-phase-8-role-cabinets.md'
      ),
      'utf8'
    );
    expect(plan).toContain('8.2');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Срез 2');
  });
});
