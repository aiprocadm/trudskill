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
    // TXT-005: «Нет данных» запрещено — человеку нужно понимать, почему пусто.
    return (
      <p className="ui-text-muted">
        За выбранный период и отбор считать нечего — попробуйте расширить период.
      </p>
    );
  }
  /*
   * ТЗ 5.12.7: строки данных ЕСТЬ, но все значения нулевые. Столбики нулевой длины выглядят
   * как сломанная диаграмма: подписи есть, полос нет (журнал 484). Говорим прямо, и сразу —
   * почему так бывает.
   */
  if (data.every((one) => one.value === 0)) {
    return (
      <p className="ui-text-muted">
        Считать нечего: по выбранному отбору ещё ни одного результата. Показатель появится, когда
        слушатели начнут завершать обучение.
      </p>
    );
  }
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={labelGutter + width + 48}
      height={layout.height}
      style={{ maxWidth: '100%' }}
    >
      {/*
        ТЗ 5.12.7: у диаграммы должна быть ось. Вертикальная линия отсчёта показывает, откуда
        меряется длина: без неё столбик — просто цветной прямоугольник рядом с числом.
      */}
      <line
        x1={labelGutter}
        y1={0}
        x2={labelGutter}
        y2={layout.height}
        stroke="var(--ui-border)"
        strokeWidth={1}
      />
      {layout.bars.map((bar) => (
        <g key={bar.label} transform={`translate(0, ${bar.y})`}>
          {/* Токены строго --ui-*: прежние var(--color-*) не существуют нигде в палитре,
              подписи молча падали в чёрный (в тёмной теме — невидимы), столбики — в
              запасной цвет мимо палитры и брендирования центра. */}
          <text x={0} y={barHeight * 0.7} fontSize={13} fill="var(--ui-text-muted)">
            {bar.label.length > 18 ? `${bar.label.slice(0, 17)}…` : bar.label}
          </text>
          <rect
            x={labelGutter}
            y={2}
            width={bar.width}
            height={barHeight - 4}
            rx={3}
            fill="var(--ui-brand-600)"
          />
          <text
            x={labelGutter + bar.width + 6}
            y={barHeight * 0.7}
            fontSize={13}
            fill="var(--ui-text)"
          >
            {bar.value}
          </text>
        </g>
      ))}
    </svg>
  );
}
