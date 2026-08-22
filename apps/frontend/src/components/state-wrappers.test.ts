import { describe, expect, it } from 'vitest';

import { SectionError } from './state-wrappers';

/**
 * `CMP-020`: компоненты каркаса переехали в пакет — их поведение проверяет
 * `page-shell.test.tsx` там же. Здесь остаётся единственное, что живёт в прослойке
 * по существу: разбор пойманной ошибки (`TXT-004`) перед передачей в пакетный
 * `SectionError`.
 */

const propsOf = (el: unknown): Record<string, unknown> =>
  (el as { props: Record<string, unknown> }).props;

const flatten = (node: unknown): unknown[] => {
  if (node === null || node === undefined || node === false) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  const el = node as { props?: { children?: unknown } };
  return [node, ...(el.props ? flatten(el.props.children) : [])];
};

describe('SectionError · прослойка разбирает ошибку словарём TXT-004', () => {
  it('ошибка запроса превращается в человеческий текст и спойлер с кодом', () => {
    const apiError = Object.assign(new Error('Entity not found'), {
      normalized: {
        status: 404,
        code: 'not_found',
        message: 'Entity not found',
        isAuthError: false
      }
    });

    const rendered = JSON.stringify(flatten(SectionError({ error: apiError })).map(propsOf));

    expect(rendered).toMatch(/[А-Яа-яЁё]/);
    // Код виден только в подробностях, исходное сообщение сервера — тоже там.
    expect(rendered).toContain('not_found');
    expect(rendered).not.toContain('"Entity not found"​');
  });

  it('без ошибки — обычное сообщение секции', () => {
    const rendered = JSON.stringify(
      flatten(SectionError({ message: 'Не удалось загрузить список' })).map(propsOf)
    );
    expect(rendered).toContain('Не удалось загрузить список');
  });
});
