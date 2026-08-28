import { describe, expect, it } from 'vitest';

import { StatCard } from './index.js';
import { propsOf } from '../../testing/element.test-util.js';

import type { ReactElement } from 'react';

/*
 * Структура children расширена в Фазе 3 (CMP-004): между значением и подписью появилось
 * сравнение. Порядок закреплён здесь же — сторож проверяет состав карточки, а не только
 * два поля.
 */
const bodyOf = (el: ReactElement): (ReactElement | null)[] => {
  const children = propsOf(el).children as ReactElement | (ReactElement | null)[];
  // У карточки-ссылки тело обёрнуто во фрагмент, у обычной — лежит прямо в div.
  return Array.isArray(children)
    ? children
    : (propsOf(children).children as (ReactElement | null)[]);
};

describe('StatCard — метрика дашборда', () => {
  it('рендерит label и value в классы stat-card__*', () => {
    const el = StatCard({ label: 'Слушатели', value: 128 });
    expect(propsOf(el).className).toBe('stat-card');
    const [label, value, trend, sub] = bodyOf(el);
    expect(propsOf(label).className).toBe('stat-card__label');
    expect(propsOf(label).children).toBe('Слушатели');
    expect(propsOf(value).className).toBe('stat-card__value');
    expect(propsOf(value).children).toBe(128);
    expect(trend).toBeNull();
    expect(sub).toBeNull();
  });

  it('sub опционален', () => {
    const el = StatCard({ label: 'Сдано', value: '87%', sub: 'за 30 дней' });
    const [, , , sub] = bodyOf(el);
    expect(propsOf(sub).className).toBe('stat-card__sub');
    expect(propsOf(sub).children).toBe('за 30 дней');
  });

  it('CMP-004: тон сравнения отделён от направления', () => {
    // Рост числа блокеров — стрелка вверх и одновременно плохая новость.
    const el = StatCard({
      label: 'Блокеры',
      value: 5,
      trend: { value: '+3 за неделю', direction: 'up', tone: 'negative' }
    });
    const [, , trend] = bodyOf(el);
    expect(propsOf(trend).className).toBe('stat-card__trend stat-card__trend--negative');
  });

  it('CMP-004: карточка с href становится ссылкой', () => {
    const el = StatCard({ label: 'Просрочено', value: 2, href: '/groups' });
    expect(el.type).toBe('a');
    expect(propsOf(el).href).toBe('/groups');
    expect(propsOf(el).className).toBe('stat-card stat-card--link');
  });

  it('без href карточка остаётся обычным блоком', () => {
    expect(StatCard({ label: 'Просрочено', value: 2 }).type).toBe('div');
  });
});
