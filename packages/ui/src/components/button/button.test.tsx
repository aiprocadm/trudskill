import { describe, expect, it, vi } from 'vitest';

import { Button } from './index.js';

import type { ReactElement } from 'react';

describe('Button — обёртка над ui-button классами', () => {
  it('по умолчанию: type=button, класс ui-button, не disabled', () => {
    const el = Button({ children: 'Сохранить' });
    expect(el.props.type).toBe('button');
    expect(el.props.className).toBe('ui-button');
    expect(el.props.disabled).toBe(false);
  });

  it('variant → канонический BEM-модификатор ui-button--<variant>', () => {
    const el = Button({ variant: 'primary', children: 'Создать' });
    expect(el.props.className).toBe('ui-button ui-button--primary');
  });

  it('loading: класс --loading, disabled и aria-busy', () => {
    const el = Button({ loading: true, children: 'Сохранить' });
    expect(el.props.className).toContain('ui-button--loading');
    expect(el.props.disabled).toBe(true);
    expect(el.props['aria-busy']).toBe(true);
  });

  it('icon оборачивается в декоративный span', () => {
    const glyph = { type: 'svg', props: {} } as unknown as ReactElement;
    const el = Button({ icon: glyph, children: 'Экспорт' });
    const [iconSpan] = el.props.children as ReactElement[];
    expect(iconSpan.props.className).toBe('ui-button__icon');
    expect(iconSpan.props['aria-hidden']).toBe(true);
  });

  it('пробрасывает onClick и сливает className', () => {
    const onClick = vi.fn();
    const el = Button({ onClick, className: 'extra', children: 'Ок' });
    el.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(el.props.className).toBe('ui-button extra');
  });
});
