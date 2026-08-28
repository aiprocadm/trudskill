import { describe, expect, it } from 'vitest';

import { WizardSteps } from './index.js';
import { propsOf, textOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

const STEPS = [
  { id: 'file', title: 'Файл' },
  { id: 'check', title: 'Проверка' },
  { id: 'result', title: 'Результат' }
];

const stepItems = (element: ReactElement): ReactElement[] => {
  const [, list] = propsOf(element).children as ReactElement[];
  return propsOf(list).children as ReactElement[];
};

const counterOf = (element: ReactElement): ReactElement =>
  (propsOf(element).children as ReactElement[])[0] as ReactElement;

describe('шаги мастера (TPL-004)', () => {
  it('без шагов ничего не рисует', () => {
    expect(WizardSteps({ steps: [], currentId: 'file' })).toBeNull();
  });

  it('пройденные шаги отличаются от текущего и от будущих', () => {
    const element = WizardSteps({ steps: STEPS, currentId: 'check' }) as ReactElement;
    const [first, second, third] = stepItems(element);
    expect(propsOf(first).className).toContain('ui-step--done');
    expect(propsOf(second).className).toContain('ui-step--active');
    expect(propsOf(third).className).toBe('ui-step');
  });

  it('вперёд перепрыгнуть нельзя — непроверенный шаг дал бы половинчатый результат', () => {
    const element = WizardSteps({
      steps: STEPS,
      currentId: 'file',
      onSelect: () => {}
    }) as ReactElement;
    const [first, second] = stepItems(element);
    expect(propsOf(propsOf(first).children).disabled).toBe(true); // текущий — некуда идти
    expect(propsOf(propsOf(second).children).disabled).toBe(true); // будущий — закрыт
  });

  it('назад вернуться можно', () => {
    const element = WizardSteps({
      steps: STEPS,
      currentId: 'result',
      onSelect: () => {}
    }) as ReactElement;
    const [first] = stepItems(element);
    expect(propsOf(propsOf(first).children).disabled).toBe(false);
  });

  it('без обработчика шаги только показываются', () => {
    const element = WizardSteps({ steps: STEPS, currentId: 'result' }) as ReactElement;
    for (const item of stepItems(element)) {
      expect(propsOf(propsOf(item).children).disabled).toBe(true);
    }
  });

  it('текущий шаг помечен для программ чтения с экрана', () => {
    const element = WizardSteps({ steps: STEPS, currentId: 'check' }) as ReactElement;
    const [, second] = stepItems(element);
    expect(propsOf(propsOf(second).children)['aria-current']).toBe('step');
  });

  it('на телефоне вместо полосы читается «Шаг 2 из 3» с названием', () => {
    // §7.4: пилюли на 360px переносятся в три ряда и вытесняют первое поле за сгиб.
    const element = WizardSteps({ steps: STEPS, currentId: 'check' }) as ReactElement;
    expect(textOf(counterOf(element))).toBe('Шаг 2 из 3: Проверка');
  });

  it('неизвестный текущий шаг не роняет счётчик', () => {
    const element = WizardSteps({ steps: STEPS, currentId: 'нет-такого' }) as ReactElement;
    expect(textOf(counterOf(element))).toBe('Шаг 1 из 3: Файл');
  });
});
