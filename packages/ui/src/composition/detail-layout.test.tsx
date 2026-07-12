import { describe, expect, it } from 'vitest';

import { DetailLayout } from './detail-layout.js';

describe('DetailLayout — двухколоночная раскладка карточки', () => {
  it('рендерит .ui-detail с main и aside', () => {
    const el = DetailLayout({ aside: 'ASIDE', children: 'MAIN' });
    expect(el.props.className).toBe('ui-detail');
    const [main, aside] = el.props.children as any[];
    expect(main.props.className).toBe('ui-detail__main');
    expect(main.props.children).toBe('MAIN');
    expect(aside.type).toBe('aside');
    expect(aside.props.className).toBe('ui-detail__aside');
    expect(aside.props.children).toBe('ASIDE');
  });
});
