import { describe, expect, it, vi } from 'vitest';

import { Button } from './index.js';
import { handlerOf, propsOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

describe('Button — обёртка над ui-button классами', () => {
  it('по умолчанию: type=button, класс ui-button, не disabled', () => {
    const el = Button({ children: 'Сохранить' });
    expect(propsOf(el).type).toBe('button');
    expect(propsOf(el).className).toBe('ui-button');
    expect(propsOf(el).disabled).toBe(false);
    expect(propsOf(el)['aria-busy']).toBeUndefined();
  });

  it('variant → канонический BEM-модификатор ui-button--<variant>', () => {
    const el = Button({ variant: 'primary', children: 'Создать' });
    expect(propsOf(el).className).toBe('ui-button ui-button--primary');
  });

  it('loading: класс --loading, disabled и aria-busy', () => {
    const el = Button({ loading: true, children: 'Сохранить' });
    expect(propsOf(el).className).toContain('ui-button--loading');
    expect(propsOf(el).disabled).toBe(true);
    expect(propsOf(el)['aria-busy']).toBe(true);
  });

  it('icon оборачивается в декоративный span', () => {
    const glyph = { type: 'svg', props: {} } as unknown as ReactElement;
    const el = Button({ icon: glyph, children: 'Экспорт' });
    const [iconSpan] = propsOf(el).children as ReactElement[];
    expect(propsOf(iconSpan).className).toBe('ui-button__icon');
    expect(propsOf(iconSpan)['aria-hidden']).toBe(true);
  });

  it('пробрасывает onClick и сливает className', () => {
    const onClick = vi.fn();
    const el = Button({ onClick, className: 'extra', children: 'Ок' });
    handlerOf(el, 'onClick')();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(propsOf(el).className).toBe('ui-button extra');
  });
});
