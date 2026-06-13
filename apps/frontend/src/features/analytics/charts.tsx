'use client';

import { type BarInput, computeBarChartLayout } from './format';

export function BarChart({
  data,
  ariaLabel,
  width = 280,
  barHeight = 22,
  gap = 8
}: {
  data: BarInput[];
  ariaLabel: string;
  width?: number;
  barHeight?: number;
  gap?: number;
}) {
  const labelGutter = 140;
  const layout = computeBarChartLayout(data, { width, barHeight, gap });
  if (data.length === 0) {
    return <p className="ui-text-muted">Нет данных для графика</p>;
  }
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={labelGutter + width + 48}
      height={layout.height}
      style={{ maxWidth: '100%' }}
    >
      {layout.bars.map((bar) => (
        <g key={bar.label} transform={`translate(0, ${bar.y})`}>
          <text x={0} y={barHeight * 0.7} fontSize={13} fill="var(--color-text-muted)">
            {bar.label.length > 18 ? `${bar.label.slice(0, 17)}…` : bar.label}
          </text>
          <rect
            x={labelGutter}
            y={2}
            width={bar.width}
            height={barHeight - 4}
            rx={3}
            fill="var(--color-primary, #1e40af)"
          />
          <text
            x={labelGutter + bar.width + 6}
            y={barHeight * 0.7}
            fontSize={13}
            fill="var(--color-text)"
          >
            {bar.value}
          </text>
        </g>
      ))}
    </svg>
  );
}
