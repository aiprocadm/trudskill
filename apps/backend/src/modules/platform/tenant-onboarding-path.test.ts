import { describe, expect, it } from 'vitest';

import { onboardingPath } from './tenant-onboarding-path.js';

/**
 * Путь подключения учебного центра (ТЗ 13.1).
 *
 * Проверяется не «шаги перечислены», а то, ради чего путь заведён: на каком шаге застряло
 * подключение и **чей сейчас ход**. Половина задержек подключения — это «мы ждали их, они ждали
 * нас»; когда на экране написано «ход за центром», звонить не нужно.
 */

const base = { tenantStatus: 'trial', setupReady: false, hasPlan: false };

describe('на каком шаге подключение (ТЗ 13.1)', () => {
  it('центр заведён, но не настроен — ход за центром', () => {
    const path = onboardingPath(base);

    expect(path.currentStepId).toBe('setup');
    expect(path.waitingFor, 'настраивает центр, а не платформа').toBe('tenant');
    expect(path.nextAction, 'сказано, чем грозит незавершённая настройка').toContain(
      'документы выдавать нельзя'
    );
  });

  it('настройка закрыта, идёт пробный период — ход всё ещё за центром', () => {
    const path = onboardingPath({ ...base, setupReady: true });

    expect(path.currentStepId).toBe('trial');
    expect(path.waitingFor).toBe('tenant');
  });

  it('пробный период кончился, тарифа нет — ход за платформой', () => {
    /* Это и есть частая точка провисания: центр ждёт счёт, платформа ждёт решения центра. */
    const path = onboardingPath({ tenantStatus: 'active', setupReady: true, hasPlan: false });

    expect(path.currentStepId).toBe('paid');
    expect(path.waitingFor).toBe('platform');
  });

  it('путь пройден — никто никого не ждёт', () => {
    const path = onboardingPath({ tenantStatus: 'active', setupReady: true, hasPlan: true });

    expect(path.currentStepId).toBeNull();
    expect(path.waitingFor).toBeNull();
    expect(path.nextAction).toContain('завершено');
  });
});

describe('особые состояния центра (ТЗ 13.1)', () => {
  it('архивный центр из пути выпадает', () => {
    /* Он не подключается, а закрыт: показывать ему «осталось настроить» бессмысленно. */
    const path = onboardingPath({ tenantStatus: 'archived', setupReady: false, hasPlan: false });

    expect(path.currentStepId).toBeNull();
    expect(path.waitingFor).toBeNull();
    expect(path.nextAction).toContain('архиве');
  });

  it('приостановленный центр остаётся на своём шаге', () => {
    /* Приостановка — пауза, а не откат к началу: настройка, которую уже сделали, не пропала. */
    const path = onboardingPath({ tenantStatus: 'suspended', setupReady: true, hasPlan: false });

    expect(path.currentStepId, 'пробный период считается пройденным — центр уже не trial').toBe(
      'paid'
    );
    expect(path.steps.find((step) => step.id === 'setup')?.done).toBe(true);
  });
});

describe('путь читается одинаково обеими сторонами (ТЗ 13.1)', () => {
  it('у каждого шага назван ответственный', () => {
    /*
     * Это главное требование ТЗ: «каждый шаг виден и центру, и администратору платформы».
     * Шаг без ответственного превращает путь в список без смысла.
     */
    const path = onboardingPath(base);
    expect(path.steps).toHaveLength(5);
    for (const step of path.steps) {
      expect(['platform', 'tenant'], `${step.id}: ответственный не назван`).toContain(step.owner);
      expect(step.title.length, `${step.id}: шаг без названия`).toBeGreaterThan(3);
    }
  });

  it('настройка — за центром, тариф — за платформой', () => {
    const path = onboardingPath(base);
    const owners = Object.fromEntries(path.steps.map((step) => [step.id, step.owner]));

    expect(owners.setup).toBe('tenant');
    expect(owners.trial).toBe('tenant');
    expect(owners.paid).toBe('platform');
    expect(owners.created).toBe('platform');
  });

  it('шаги идут по порядку и не перепрыгиваются', () => {
    /* Незакрытый шаг не может стоять после закрытого: путь читался бы как попало. */
    const path = onboardingPath({ ...base, setupReady: true });
    const firstUndone = path.steps.findIndex((step) => !step.done);
    const lastDone = path.steps.map((step) => step.done).lastIndexOf(true);

    expect(firstUndone, 'после первого незакрытого шага закрытых быть не должно').toBeGreaterThan(
      lastDone
    );
  });
});
