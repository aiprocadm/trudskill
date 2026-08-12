import { describe, expect, it } from 'vitest';

import { StatCard } from './index.js';

import type { ReactElement } from 'react';

/*
 * Структура children расширена в Фазе 3 (CMP-004): между значением и подписью появилось
 * сравнение. Порядок закреплён здесь же — сторож проверяет состав карточки, а не только
 * два поля.
 */
const bodyOf = (el: ReactElement): (ReactElement | null)[] => {
  const children = el.props.children as ReactElement | (ReactElement | null)[];
  // У карточки-ссылки тело обёрнуто во фрагмент, у обычной — лежит прямо в div.
  return Array.isArray(children) ? children : (children.props.children as (ReactElement | null)[]);
};

describe('StatCard — метрика дашборда', () => {
  it('рендерит label и value в классы stat-card__*', () => {
    const el = StatCard({ label: 'Слушатели', value: 128 });
    expect(el.props.className).toBe('stat-card');
    const [label, value, trend, sub] = bodyOf(el);
    expect(label?.props.className).toBe('stat-card__label');
    expect(label?.props.children).toBe('Слушатели');
    expect(value?.props.className).toBe('stat-card__value');
    expect(value?.props.children).toBe(128);
    expect(trend).toBeNull();
    expect(sub).toBeNull();
  });

  it('sub опционален', () => {
    const el = StatCard({ label: 'Сдано', value: '87%', sub: 'за 30 дней' });
    const [, , , sub] = bodyOf(el);
    expect(sub?.props.className).toBe('stat-card__sub');
    expect(sub?.props.children).toBe('за 30 дней');
  });

  it('CMP-004: тон сравнения отделён от направления', () => {
    // Рост числа блокеров — стрелка вверх и одновременно плохая новость.
    const el = StatCard({
      label: 'Блокеры',
      value: 5,
      trend: { value: '+3 за неделю', direction: 'up', tone: 'negative' }
    });
    const [, , trend] = bodyOf(el);
    expect(trend?.props.className).toBe('stat-card__trend stat-card__trend--negative');
  });

  it('CMP-004: карточка с href становится ссылкой', () => {
    const el = StatCard({ label: 'Просрочено', value: 2, href: '/groups' });
    expect(el.type).toBe('a');
    expect(el.props.href).toBe('/groups');
    expect(el.props.className).toBe('stat-card stat-card--link');
  });

  it('без href карточка остаётся обычным блоком', () => {
    expect(StatCard({ label: 'Просрочено', value: 2 }).type).toBe('div');
  });
});
