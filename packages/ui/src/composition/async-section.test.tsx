import { describe, expect, it } from 'vitest';

import { AsyncSection } from './async-section.js';
import { EmptyState, ErrorState, LoadingState } from '../components/states/index.js';
import { propsOf } from '../testing/element.test-util.js';

describe('AsyncSection — единая цепочка состояний', () => {
  it('isLoading → LoadingState (первым приоритетом)', () => {
    const el = AsyncSection({ isLoading: true, children: 'DATA' });
    expect(el.type).toBe(LoadingState);
  });

  it('error → ui-stack с ErrorState (message из Error) и кнопкой «Повторить»', () => {
    const el = AsyncSection({
      isLoading: false,
      error: new Error('boom'),
      onRetry: () => {},
      children: 'DATA'
    });
    expect(propsOf(el).className).toBe('ui-stack');
    const [err, retry] = propsOf(el).children as any[];
    expect(err.type).toBe(ErrorState);
    expect(err.props.message).toBe('boom');
    expect(retry.props.children).toBe('Повторить');
  });

  it('error без onRetry → без кнопки', () => {
    const el = AsyncSection({ isLoading: false, error: 'x', children: 'DATA' });
    const [, retry] = propsOf(el).children as any[];
    expect(retry).toBeNull();
  });

  it('isEmpty → EmptyState', () => {
    const el = AsyncSection({ isLoading: false, isEmpty: true, children: 'DATA' });
    expect(el.type).toBe(EmptyState);
  });

  it('готово → Fragment с children', () => {
    const el = AsyncSection({ isLoading: false, children: 'DATA' });
    expect(propsOf(el).children).toBe('DATA');
  });

  /*
   * CMP-014: пустой экран объясняет, что сделать первым. Действие прокидывается
   * через обёртку — иначе каждый экран рисовал бы своё пустое состояние в обход
   * общей цепочки и терял бы единообразие, ради которого обёртка и заводилась.
   */
  it('пустое состояние передаёт первое действие в EmptyState', () => {
    const el = AsyncSection({
      isLoading: false,
      isEmpty: true,
      emptyMessage: 'Групп пока нет',
      emptyAction: { label: 'Создать первую группу', href: '/groups/new' },
      children: 'DATA'
    });
    expect(propsOf(el).action).toEqual({ label: 'Создать первую группу', href: '/groups/new' });
  });

  it('без действия пустое состояние остаётся прежним', () => {
    const el = AsyncSection({ isLoading: false, isEmpty: true, children: 'DATA' });
    expect(propsOf(el).action).toBeUndefined();
  });
});
