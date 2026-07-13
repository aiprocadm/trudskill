import { describe, expect, it } from 'vitest';

import { StatGrid } from './stat-grid.js';
import { StatCard } from '../components/stat-card/index.js';

describe('StatGrid — ряд KPI поверх StatCard', () => {
  it('рендерит div.stat-grid со StatCard на каждый элемент', () => {
    const el = StatGrid({
      items: [
        { label: 'Слушателей', value: 1248 },
        { label: 'Групп', value: 37, sub: 'активных' }
      ]
    });
    expect(el.props.className).toBe('stat-grid');
    const cards = el.props.children as any[];
    expect(cards).toHaveLength(2);
    expect(cards[0].type).toBe(StatCard);
    expect(cards[0].props.label).toBe('Слушателей');
    expect(cards[0].props.value).toBe(1248);
    expect(cards[1].props.sub).toBe('активных');
  });

  it('sub опускается, если не задан (exactOptionalPropertyTypes)', () => {
    const el = StatGrid({ items: [{ label: 'A', value: 1 }] });
    const [card] = el.props.children as any[];
    expect(card.props.sub).toBeUndefined();
  });
});
