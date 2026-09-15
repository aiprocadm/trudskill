import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary, subscribeRenderErrors } from './error-boundary.js';
import { propsOf } from '../testing/element.test-util.js';

/**
 * Перехватчик падений на уровне содержимого (ТЗ «Стабилизация, UX и развитие», 1.1.4).
 *
 * Требование: «ErrorBoundary на уровне сегмента приложения, чтобы падение одного блока не
 * убивало страницу целиком». В проекте не было НИ ОДНОГО перехватчика: любое исключение при
 * отрисовке уносило страницу в `app/error.tsx` — то есть вместе с меню и выходом. Человек
 * оставался на голом экране без единого способа уйти.
 *
 * Здесь проверяется ровно поведение перехватчика; то, что им обёрнуто именно содержимое
 * страницы (а не вся страница вместе с оболочкой), держит сторож приложения.
 */

const render = (node: unknown) => node as { type?: unknown; props?: Record<string, unknown> };

describe('ErrorBoundary — падение блока не уносит страницу', () => {
  it('без ошибки показывает то, что в него вложено', () => {
    const boundary = new ErrorBoundary({ children: 'СОДЕРЖИМОЕ' });
    expect(boundary.render()).toBe('СОДЕРЖИМОЕ');
  });

  it('при падении показывает человеку, что случилось и что делать', () => {
    const boundary = new ErrorBoundary({ children: 'СОДЕРЖИМОЕ' });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('внутренняя поломка'));

    const shown = JSON.stringify(render(boundary.render()));
    expect(shown, 'сообщение обязано быть человеческим, а не текстом исключения').toContain(
      'Этот блок не удалось показать'
    );
    expect(shown, 'человеку нужно действие, а не только констатация').toContain('Повторить');
    expect(
      shown,
      'текст исключения в лицо не показывается — он уходит в подробности'
    ).not.toContain('внутренняя поломка');
  });

  it('сообщает о падении наружу — для сбора ошибок (15.1)', () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeRenderErrors((error) => seen.push(error));

    const boundary = new ErrorBoundary({ children: 'СОДЕРЖИМОЕ' });
    const failure = new Error('внутренняя поломка');
    boundary.componentDidCatch(failure, { componentStack: 'стек' });

    unsubscribe();
    expect(seen, 'падение обязано дойти до сбора ошибок, иначе его никто не увидит').toEqual([
      failure
    ]);
  });

  it('кнопка «Повторить» снимает ошибку, а не перезагружает страницу', () => {
    const boundary = new ErrorBoundary({ children: 'СОДЕРЖИМОЕ' });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('поломка'));
    const setState = vi.fn();
    (boundary as unknown as { setState: unknown }).setState = setState;

    const fallback = boundary.render();
    const button = JSON.parse(JSON.stringify(fallback));
    expect(JSON.stringify(button)).toContain('Повторить');

    /* Обработчик берём из дерева: нажатие обязано вернуть блок к обычному виду. */
    const findOnClick = (node: unknown): unknown => {
      if (node === null || typeof node !== 'object') return null;
      const element = node as { props?: Record<string, unknown> };
      if (typeof element.props?.onClick === 'function') return element.props.onClick;
      const children = element.props?.children;
      for (const child of Array.isArray(children) ? children : [children]) {
        const found = findOnClick(child);
        if (found) return found;
      }
      return null;
    };
    const onClick = findOnClick(fallback) as (() => void) | null;
    expect(onClick, 'у кнопки обязан быть обработчик').toBeTypeOf('function');
    onClick?.();
    expect(setState).toHaveBeenCalledWith({ error: null });
  });

  it('падение внутри блока не трогает свойства оболочки', () => {
    /* Оболочка (меню, выход) живёт ВЫШЕ перехватчика: он возвращает только своё поддерево. */
    const boundary = new ErrorBoundary({ children: 'СОДЕРЖИМОЕ' });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('поломка'));
    expect(propsOf(boundary.render()).className).toContain('ui-');
  });
});
