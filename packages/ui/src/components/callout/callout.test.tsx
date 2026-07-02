import { describe, expect, it } from 'vitest';

import { Callout } from './index.js';

import type { ReactElement } from 'react';

describe('Callout — статичная плашка-уведомление', () => {
  it('info/success — role=status', () => {
    expect(Callout({ tone: 'info', children: 'Совет' }).props.role).toBe('status');
    expect(Callout({ tone: 'success', children: 'Готово' }).props.role).toBe('status');
  });

  it('warning/danger — role=alert', () => {
    expect(Callout({ tone: 'warning', children: 'Внимание' }).props.role).toBe('alert');
    expect(Callout({ tone: 'danger', children: 'Ошибка' }).props.role).toBe('alert');
  });

  it('класс тона и опциональный заголовок', () => {
    const el = Callout({
      tone: 'warning',
      title: 'Проверьте данные',
      children: 'СНИЛС не прошёл контроль'
    });
    expect(el.props.className).toBe('ui-callout ui-callout--warning');
    const body = el.props.children as ReactElement;
    const [title, content] = body.props.children as ReactElement[];
    expect(title.props.className).toBe('ui-callout__title');
    expect(title.props.children).toBe('Проверьте данные');
    expect(content).toBe('СНИЛС не прошёл контроль');
  });

  it('tone по умолчанию — info', () => {
    expect(Callout({ children: 'Текст' }).props.className).toBe('ui-callout ui-callout--info');
  });

  it('role переопределяется для статичных баннеров', () => {
    const el = Callout({ tone: 'danger', role: 'status', children: 'Аннулирован' });
    expect(el.props.role).toBe('status');
  });
});
