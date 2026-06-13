import { describe, expect, it } from 'vitest';

import { computeBarChartLayout, formatDays, formatPercent } from './format';

describe('analytics format helpers', () => {
  it('formats 0..1 ratio as percent string', () => {
    expect(formatPercent(0.5)).toBe('50.0 %');
    expect(formatPercent(null)).toBe('—');
  });

  it('formats average days', () => {
    expect(formatDays(10)).toBe('10.0 дн.');
    expect(formatDays(null)).toBe('—');
  });

  it('lays out bars proportionally to the max value', () => {
    const layout = computeBarChartLayout(
      [
        { label: 'A', value: 10 },
        { label: 'B', value: 5 },
        { label: 'C', value: 0 }
      ],
      { width: 200, barHeight: 20, gap: 4 }
    );
    expect(layout.bars).toHaveLength(3);
    expect(layout.bars[0]?.width).toBeCloseTo(200); // max → full width
    expect(layout.bars[1]?.width).toBeCloseTo(100); // half
    expect(layout.bars[2]?.width).toBe(0);
    expect(layout.height).toBe(3 * 20 + 2 * 4);
    expect(layout.bars[1]?.y).toBe(20 + 4);
  });

  it('handles an all-zero dataset without dividing by zero', () => {
    const layout = computeBarChartLayout([{ label: 'A', value: 0 }], {
      width: 100,
      barHeight: 10,
      gap: 2
    });
    expect(layout.bars[0]?.width).toBe(0);
  });
});
