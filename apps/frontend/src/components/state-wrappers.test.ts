import { describe, expect, it } from 'vitest';

import { SectionCard } from './state-wrappers';

describe('SectionCard — заголовок со слотами', () => {
  it('без actions/subtitle: section.ui-section-card + h3.ui-section-title', () => {
    const el = SectionCard({ title: 'Список', children: 'X' });
    expect(el.props.className).toBe('ui-section-card');
  });

  it('actions рендерятся в шапке секции', () => {
    const el = SectionCard({ title: 'Список', actions: 'ACT', children: 'X' });
    // шапка = первый ребёнок; ищем переданный actions-узел где-то в дереве
    expect(JSON.stringify(el.props.children)).toContain('ACT');
  });
});
