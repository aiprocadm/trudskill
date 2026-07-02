import { describe, expect, it } from 'vitest';

import { StatCard } from './index.js';

import type { ReactElement } from 'react';

describe('StatCard — метрика дашборда', () => {
  it('рендерит label и value в классы stat-card__*', () => {
    const el = StatCard({ label: 'Слушатели', value: 128 });
    expect(el.props.className).toBe('stat-card');
    const [label, value, sub] = el.props.children as (ReactElement | null)[];
    expect(label?.props.className).toBe('stat-card__label');
    expect(label?.props.children).toBe('Слушатели');
    expect(value?.props.className).toBe('stat-card__value');
    expect(value?.props.children).toBe(128);
    expect(sub).toBeNull();
  });

  it('sub опционален', () => {
    const el = StatCard({ label: 'Сдано', value: '87%', sub: 'за 30 дней' });
    const [, , sub] = el.props.children as ReactElement[];
    expect(sub.props.className).toBe('stat-card__sub');
    expect(sub.props.children).toBe('за 30 дней');
  });
});
