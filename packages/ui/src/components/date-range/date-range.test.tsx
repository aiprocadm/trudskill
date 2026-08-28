import { describe, expect, it, vi } from 'vitest';

import { DateRangeField } from './index.js';
import { handlerOf, propsOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

describe('DateRangeField — диапазон дат в контракте ui-field', () => {
  it('обёрнут в ui-field с подписью по умолчанию «Период»', () => {
    const el = DateRangeField({ value: {}, onChange: () => {} });
    expect(propsOf(el).className).toBe('ui-field');
    const [label] = propsOf(el).children as ReactElement[];
    expect(propsOf(label).className).toBe('ui-field-label');
    expect(propsOf(label).children).toBe('Период');
  });

  it('оба input имеют класс ui-input и aria-метки «с»/«по»', () => {
    const el = DateRangeField({
      value: { from: '2026-07-01', to: '2026-07-31' },
      onChange: () => {}
    });
    const [, row] = propsOf(el).children as ReactElement[];
    const [from, to] = propsOf(row).children as ReactElement[];
    expect(propsOf(from).className).toBe('ui-input');
    expect(propsOf(from)['aria-label']).toBe('Период: с');
    expect(propsOf(from).value).toBe('2026-07-01');
    expect(propsOf(to)['aria-label']).toBe('Период: по');
    expect(propsOf(to).value).toBe('2026-07-31');
  });

  it('кастомный label попадает в подпись и aria-метки', () => {
    const el = DateRangeField({ value: {}, onChange: () => {}, label: 'Срок действия' });
    const [label, row] = propsOf(el).children as ReactElement[];
    expect(propsOf(label).children).toBe('Срок действия');
    const [from] = propsOf(row).children as ReactElement[];
    expect(propsOf(from)['aria-label']).toBe('Срок действия: с');
  });

  it('onChange отдаёт обновлённый диапазон', () => {
    const onChange = vi.fn();
    const el = DateRangeField({ value: { from: '2026-07-01' }, onChange });
    const [, row] = propsOf(el).children as ReactElement[];
    const [, to] = propsOf(row).children as ReactElement[];
    handlerOf(to, 'onChange')({ target: { value: '2026-07-31' } });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' });
  });
});
