import { describe, expect, it } from 'vitest';

import { ProgressBar } from './index.js';

import type { ReactElement } from 'react';

const trackOf = (element: ReactElement): ReactElement =>
  (element.props.children as ReactElement[])[0] as ReactElement;

const fillOf = (element: ReactElement): ReactElement =>
  trackOf(element).props.children as ReactElement;

const captionOf = (element: ReactElement): ReactElement | null =>
  (element.props.children as ReactElement[])[1] as ReactElement | null;

describe('полоса заполнения', () => {
  it('ширина заливки равна значению', () => {
    const element = ProgressBar({ value: 42, label: 'Прогресс' });
    expect(fillOf(element).props.style.width).toBe('42%');
    expect(trackOf(element).props['aria-valuenow']).toBe(42);
  });

  /*
   * Проценты приходят из расчёта, а расчёт бывает неверным: доля больше 100 при
   * перерасходе лимита или отрицательная при рассинхроне счётчиков. Полоса не должна
   * вылезать за свои границы и не должна показывать «-15%» голосом.
   */
  it('значения вне диапазона подрезаются, а не рисуются как есть', () => {
    expect(fillOf(ProgressBar({ value: 180, label: 'Расход' })).props.style.width).toBe('100%');
    expect(fillOf(ProgressBar({ value: -20, label: 'Расход' })).props.style.width).toBe('0%');
  });

  it('дробное значение округляется — половин процента на полосе не видно', () => {
    expect(fillOf(ProgressBar({ value: 33.4, label: 'Расход' })).props.style.width).toBe('33%');
  });

  /*
   * Тон отделён от значения: 90% прогресса по курсу — это хорошо, 90% расхода лимита —
   * тревога. Если бы цвет считался из числа, один из двух случаев красился бы неверно.
   */
  it('тон задаётся отдельно от значения', () => {
    expect(trackOf(ProgressBar({ value: 90, label: 'Курс' })).props.className).toContain(
      'ui-progress__track--brand'
    );
    expect(
      trackOf(ProgressBar({ value: 90, label: 'Лимит', tone: 'danger' })).props.className
    ).toContain('ui-progress__track--danger');
  });

  it('полоса называет себя тем, кто слушает экран голосом', () => {
    const track = trackOf(ProgressBar({ value: 10, label: 'Хранилище' }));
    expect(track.props.role).toBe('progressbar');
    expect(track.props['aria-label']).toBe('Хранилище');
  });

  it('подпись под полосой показывается, только если её задали', () => {
    expect(captionOf(ProgressBar({ value: 10, label: 'Хранилище' }))).toBeNull();
    expect(
      captionOf(ProgressBar({ value: 10, label: 'Хранилище', caption: '2 из 20 ГБ' }))?.props
        .children
    ).toBe('2 из 20 ГБ');
  });
});
