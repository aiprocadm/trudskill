import { describe, expect, it, vi } from 'vitest';

import { DateRangeField } from './index.js';

import type { ReactElement } from 'react';

describe('DateRangeField — диапазон дат в контракте ui-field', () => {
  it('обёрнут в ui-field с подписью по умолчанию «Период»', () => {
    const el = DateRangeField({ value: {}, onChange: () => {} });
    expect(el.props.className).toBe('ui-field');
    const [label] = el.props.children as ReactElement[];
    expect(label.props.className).toBe('ui-field-label');
    expect(label.props.children).toBe('Период');
  });

  it('оба input имеют класс ui-input и aria-метки «с»/«по»', () => {
    const el = DateRangeField({
      value: { from: '2026-07-01', to: '2026-07-31' },
      onChange: () => {}
    });
    const [, row] = el.props.children as ReactElement[];
    const [from, to] = row.props.children as ReactElement[];
    expect(from.props.className).toBe('ui-input');
    expect(from.props['aria-label']).toBe('Период: с');
    expect(from.props.value).toBe('2026-07-01');
    expect(to.props['aria-label']).toBe('Период: по');
    expect(to.props.value).toBe('2026-07-31');
  });

  it('кастомный label попадает в подпись и aria-метки', () => {
    const el = DateRangeField({ value: {}, onChange: () => {}, label: 'Срок действия' });
    const [label, row] = el.props.children as ReactElement[];
    expect(label.props.children).toBe('Срок действия');
    const [from] = row.props.children as ReactElement[];
    expect(from.props['aria-label']).toBe('Срок действия: с');
  });

  it('onChange отдаёт обновлённый диапазон', () => {
    const onChange = vi.fn();
    const el = DateRangeField({ value: { from: '2026-07-01' }, onChange });
    const [, row] = el.props.children as ReactElement[];
    const [, to] = row.props.children as ReactElement[];
    to.props.onChange({ target: { value: '2026-07-31' } });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' });
  });
});
