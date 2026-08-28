import { describe, expect, it } from 'vitest';

import { Callout } from './index.js';
import { propsOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

describe('Callout — статичная плашка-уведомление', () => {
  it('info/success — role=status', () => {
    expect(propsOf(Callout({ tone: 'info', children: 'Совет' })).role).toBe('status');
    expect(propsOf(Callout({ tone: 'success', children: 'Готово' })).role).toBe('status');
  });

  it('warning/danger — role=alert', () => {
    expect(propsOf(Callout({ tone: 'warning', children: 'Внимание' })).role).toBe('alert');
    expect(propsOf(Callout({ tone: 'danger', children: 'Ошибка' })).role).toBe('alert');
  });

  it('класс тона и опциональный заголовок', () => {
    const el = Callout({
      tone: 'warning',
      title: 'Проверьте данные',
      children: 'СНИЛС не прошёл контроль'
    });
    expect(propsOf(el).className).toBe('ui-callout ui-callout--warning');
    const body = propsOf(el).children as ReactElement;
    const [title, content] = propsOf(body).children as ReactElement[];
    expect(propsOf(title).className).toBe('ui-callout__title');
    expect(propsOf(title).children).toBe('Проверьте данные');
    expect(content).toBe('СНИЛС не прошёл контроль');
  });

  it('tone по умолчанию — info', () => {
    expect(propsOf(Callout({ children: 'Текст' })).className).toBe('ui-callout ui-callout--info');
  });

  it('role переопределяется для статичных баннеров', () => {
    const el = Callout({ tone: 'danger', role: 'status', children: 'Аннулирован' });
    expect(propsOf(el).role).toBe('status');
  });
});
