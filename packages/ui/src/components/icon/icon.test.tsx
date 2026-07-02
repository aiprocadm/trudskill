import { Home } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { Icon } from './index.js';

describe('Icon — единая обёртка над lucide-react', () => {
  it('декоративная по умолчанию: aria-hidden, размер 18, stroke 1.75', () => {
    const el = Icon({ icon: Home });
    expect(el.props['aria-hidden']).toBe(true);
    expect(el.props.size).toBe(18);
    expect(el.props.strokeWidth).toBe(1.75);
  });

  it('с label — самостоятельный смысл: role=img + aria-label, без aria-hidden', () => {
    const el = Icon({ icon: Home, label: 'Главная' });
    expect(el.props['aria-label']).toBe('Главная');
    expect(el.props.role).toBe('img');
    expect(el.props['aria-hidden']).toBeUndefined();
  });

  it('размер только из шкалы', () => {
    const el = Icon({ icon: Home, size: 24 });
    expect(el.props.size).toBe(24);
  });
});
