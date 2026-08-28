import { Home } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { Icon } from './index.js';
import { propsOf } from '../../testing/element.test-util.js';

describe('Icon — единая обёртка над lucide-react', () => {
  /*
   * Инвариант изменён осознанно (UI-024): шкала ТЗ — 16 (в строке), 20 (в меню),
   * 24 (в заголовке). Ступень 18 убрана, значение по умолчанию стало 16, потому что
   * «по умолчанию 18» означало: почти каждая иконка вне шкалы и никто об этом не знает.
   */
  it('декоративная по умолчанию: aria-hidden, размер 16, stroke 1.75', () => {
    const el = Icon({ icon: Home });
    expect(propsOf(el)['aria-hidden']).toBe(true);
    expect(propsOf(el).size).toBe(16);
    expect(propsOf(el).strokeWidth).toBe(1.75);
    expect(propsOf(el).focusable).toBe(false);
  });

  it('с label — самостоятельный смысл: role=img + aria-label, без aria-hidden', () => {
    const el = Icon({ icon: Home, label: 'Главная' });
    expect(propsOf(el)['aria-label']).toBe('Главная');
    expect(propsOf(el).role).toBe('img');
    expect(propsOf(el)['aria-hidden']).toBeUndefined();
    expect(propsOf(el).size).toBe(16);
    expect(propsOf(el).strokeWidth).toBe(1.75);
  });

  it('размер из шкалы применяется', () => {
    const el = Icon({ icon: Home, size: 24 });
    expect(propsOf(el).size).toBe(24);
  });
});
