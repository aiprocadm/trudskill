import { describe, expect, it } from 'vitest';

import { Form, FormActions, FormSection } from './form.js';
import { SelectField } from './select-field.js';

describe('Form-каркасы', () => {
  it('Form → form.ui-form, className склеивается', () => {
    const el = Form({ children: 'X', className: 'extra' });
    expect(el.type).toBe('form');
    expect(el.props.className).toBe('ui-form extra');
  });

  it('FormActions → div.ui-form-actions', () => {
    expect(FormActions({ children: 'A' }).props.className).toBe('ui-form-actions');
  });

  it('FormSection → fieldset.ui-fieldset с legend при title', () => {
    const el = FormSection({ title: 'Реквизиты', children: 'B' });
    expect(el.props.className).toBe('ui-fieldset');
    const [legend] = el.props.children as any[];
    expect(legend.type).toBe('legend');
    expect(legend.props.children).toBe('Реквизиты');
  });

  it('SelectField → label.ui-field + select.ui-select + опции + ошибка', () => {
    const el = SelectField({
      label: 'Статус',
      error: 'Обязательно',
      options: [{ value: 'a', label: 'Активен' }],
      value: 'a',
      onChange: () => {}
    });
    expect(el.props.className).toBe('ui-field');
    const [labelSpan, select, , errorNode] = el.props.children as any[];
    expect(labelSpan.props.children[0]).toBe('Статус');
    expect(select.props.className).toBe('ui-select');
    expect(select.props['aria-invalid']).toBe(true);
    expect(errorNode.props.className).toBe('ui-field-error');
  });
});
