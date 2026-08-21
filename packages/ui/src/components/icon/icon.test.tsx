import { Home } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { Icon } from './index.js';

describe('Icon — единая обёртка над lucide-react', () => {
  /*
   * Инвариант изменён осознанно (UI-024): шкала ТЗ — 16 (в строке), 20 (в меню),
   * 24 (в заголовке). Ступень 18 убрана, значение по умолчанию стало 16, потому что
   * «по умолчанию 18» означало: почти каждая иконка вне шкалы и никто об этом не знает.
   */
  it('декоративная по умолчанию: aria-hidden, размер 16, stroke 1.75', () => {
    const el = Icon({ icon: Home });
    expect(el.props['aria-hidden']).toBe(true);
    expect(el.props.size).toBe(16);
    expect(el.props.strokeWidth).toBe(1.75);
    expect(el.props.focusable).toBe(false);
  });

  it('с label — самостоятельный смысл: role=img + aria-label, без aria-hidden', () => {
    const el = Icon({ icon: Home, label: 'Главная' });
    expect(el.props['aria-label']).toBe('Главная');
    expect(el.props.role).toBe('img');
    expect(el.props['aria-hidden']).toBeUndefined();
    expect(el.props.size).toBe(16);
    expect(el.props.strokeWidth).toBe(1.75);
  });

  it('размер из шкалы применяется', () => {
    const el = Icon({ icon: Home, size: 24 });
    expect(el.props.size).toBe(24);
  });
});
