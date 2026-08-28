import { describe, expect, it } from 'vitest';

import { Skeleton } from './index.js';
import { propsOf, styleOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

describe('Skeleton — заглушка загрузки', () => {
  it('контейнер: ui-skeleton-block, role=status, русская метка', () => {
    const el = Skeleton({});
    expect(propsOf(el).className).toBe('ui-skeleton-block');
    expect(propsOf(el).role).toBe('status');
    expect(propsOf(el)['aria-label']).toBe('Загрузка');
  });

  it('рендерит N линий ui-skeleton-line, каждая декоративная', () => {
    const el = Skeleton({ lines: 3 });
    const rows = propsOf(el).children as ReactElement[];
    expect(rows).toHaveLength(3);
    expect(propsOf(rows[0]).className).toBe('ui-skeleton-line');
    expect(propsOf(rows[0])['aria-hidden']).toBe(true);
  });

  it('lines по умолчанию 3, минимум 1', () => {
    expect(propsOf(Skeleton({})).children as ReactElement[]).toHaveLength(3);
    expect(propsOf(Skeleton({ lines: 0 })).children as ReactElement[]).toHaveLength(1);
  });

  it('ширины линий чередуются 70/80/90%', () => {
    const rows = propsOf(Skeleton({ lines: 4 })).children as ReactElement[];
    expect(rows.map((row) => styleOf(row).width)).toEqual(['70%', '80%', '90%', '70%']);
  });
});
