import { describe, expect, it } from 'vitest';

import { ProgressBar } from './index.js';
import { propsOf, styleOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

const trackOf = (element: ReactElement): ReactElement =>
  (propsOf(element).children as ReactElement[])[0] as ReactElement;

const fillOf = (element: ReactElement): ReactElement =>
  propsOf(trackOf(element)).children as ReactElement;

const captionOf = (element: ReactElement): ReactElement | null =>
  (propsOf(element).children as ReactElement[])[1] as ReactElement | null;

describe('полоса заполнения', () => {
  it('ширина заливки равна значению', () => {
    const element = ProgressBar({ value: 42, label: 'Прогресс' });
    expect(styleOf(fillOf(element)).width).toBe('42%');
    expect(propsOf(trackOf(element))['aria-valuenow']).toBe(42);
  });

  /*
   * Проценты приходят из расчёта, а расчёт бывает неверным: доля больше 100 при
   * перерасходе лимита или отрицательная при рассинхроне счётчиков. Полоса не должна
   * вылезать за свои границы и не должна показывать «-15%» голосом.
   */
  it('значения вне диапазона подрезаются, а не рисуются как есть', () => {
    expect(styleOf(fillOf(ProgressBar({ value: 180, label: 'Расход' }))).width).toBe('100%');
    expect(styleOf(fillOf(ProgressBar({ value: -20, label: 'Расход' }))).width).toBe('0%');
  });

  it('дробное значение округляется — половин процента на полосе не видно', () => {
    expect(styleOf(fillOf(ProgressBar({ value: 33.4, label: 'Расход' }))).width).toBe('33%');
  });

  /*
   * Тон отделён от значения: 90% прогресса по курсу — это хорошо, 90% расхода лимита —
   * тревога. Если бы цвет считался из числа, один из двух случаев красился бы неверно.
   */
  it('тон задаётся отдельно от значения', () => {
    expect(propsOf(trackOf(ProgressBar({ value: 90, label: 'Курс' }))).className).toContain(
      'ui-progress__track--brand'
    );
    expect(
      propsOf(trackOf(ProgressBar({ value: 90, label: 'Лимит', tone: 'danger' }))).className
    ).toContain('ui-progress__track--danger');
  });

  it('полоса называет себя тем, кто слушает экран голосом', () => {
    const track = trackOf(ProgressBar({ value: 10, label: 'Хранилище' }));
    expect(propsOf(track).role).toBe('progressbar');
    expect(propsOf(track)['aria-label']).toBe('Хранилище');
  });

  it('подпись под полосой показывается, только если её задали', () => {
    expect(captionOf(ProgressBar({ value: 10, label: 'Хранилище' }))).toBeNull();
    expect(
      propsOf(captionOf(ProgressBar({ value: 10, label: 'Хранилище', caption: '2 из 20 ГБ' })))
        .children
    ).toBe('2 из 20 ГБ');
  });
});
