import { describe, expect, it } from 'vitest';

import { AsyncSection } from './async-section.js';
import { EmptyState, ErrorState, LoadingState } from '../components/states/index.js';

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
    expect(el.props.className).toBe('ui-stack');
    const [err, retry] = el.props.children as any[];
    expect(err.type).toBe(ErrorState);
    expect(err.props.message).toBe('boom');
    expect(retry.props.children).toBe('Повторить');
  });

  it('error без onRetry → без кнопки', () => {
    const el = AsyncSection({ isLoading: false, error: 'x', children: 'DATA' });
    const [, retry] = el.props.children as any[];
    expect(retry).toBeNull();
  });

  it('isEmpty → EmptyState', () => {
    const el = AsyncSection({ isLoading: false, isEmpty: true, children: 'DATA' });
    expect(el.type).toBe(EmptyState);
  });

  it('готово → Fragment с children', () => {
    const el = AsyncSection({ isLoading: false, children: 'DATA' });
    expect(el.props.children).toBe('DATA');
  });
});
