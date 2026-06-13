export function formatPercent(ratio: number | null): string {
  if (ratio === null || Number.isNaN(ratio)) return '—';
  return `${(ratio * 100).toFixed(1)} %`;
}

export function formatDays(days: number | null): string {
  if (days === null || Number.isNaN(days)) return '—';
  return `${days.toFixed(1)} дн.`;
}

export interface BarInput {
  label: string;
  value: number;
}

export interface BarChartOptions {
  width: number;
  barHeight: number;
  gap: number;
}

export interface LaidOutBar {
  label: string;
  value: number;
  /** Pixel width proportional to the dataset max. */
  width: number;
  /** Top offset in px. */
  y: number;
}

export interface BarChartLayout {
  bars: LaidOutBar[];
  height: number;
}

/** Pure bar-chart geometry — no DOM, fully unit-testable (Deviation D-B1). */
export function computeBarChartLayout(data: BarInput[], opts: BarChartOptions): BarChartLayout {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  const bars = data.map((d, i) => ({
    label: d.label,
    value: d.value,
    width: max === 0 ? 0 : (d.value / max) * opts.width,
    y: i * (opts.barHeight + opts.gap)
  }));
  const height =
    data.length === 0 ? 0 : data.length * opts.barHeight + (data.length - 1) * opts.gap;
  return { bars, height };
}
