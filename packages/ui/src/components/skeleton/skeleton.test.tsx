import { describe, expect, it } from 'vitest';

import { Skeleton } from './index.js';

import type { ReactElement } from 'react';

describe('Skeleton — заглушка загрузки', () => {
  it('контейнер: ui-skeleton-block, role=status, русская метка', () => {
    const el = Skeleton({});
    expect(el.props.className).toBe('ui-skeleton-block');
    expect(el.props.role).toBe('status');
    expect(el.props['aria-label']).toBe('Загрузка');
  });

  it('рендерит N линий ui-skeleton-line, каждая декоративная', () => {
    const el = Skeleton({ lines: 3 });
    const rows = el.props.children as ReactElement[];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.props.className).toBe('ui-skeleton-line');
    expect(rows[0]?.props['aria-hidden']).toBe(true);
  });

  it('lines по умолчанию 3, минимум 1', () => {
    expect(Skeleton({}).props.children as ReactElement[]).toHaveLength(3);
    expect(Skeleton({ lines: 0 }).props.children as ReactElement[]).toHaveLength(1);
  });

  it('ширины линий чередуются 70/80/90%', () => {
    const rows = Skeleton({ lines: 4 }).props.children as ReactElement[];
    expect(rows.map((row) => row.props.style.width)).toEqual(['70%', '80%', '90%', '70%']);
  });
});
