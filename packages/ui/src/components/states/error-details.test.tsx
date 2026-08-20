import { describe, expect, it } from 'vitest';

import { ErrorState } from './index.js';

/**
 * `TXT-004`: технический код — под спойлером «Подробности», не в основном тексте.
 *
 * Администратору учебного центра код ошибки не говорит ничего, а поддержке без него не найти
 * причину. Спойлер разводит эти два интереса: сверху — что произошло и что делать, внутри —
 * код, ответ сервера и номер запроса, который можно продиктовать по телефону.
 */

const childrenOf = (el: unknown): unknown[] => {
  const kids = (el as { props?: { children?: unknown } }).props?.children;
  return Array.isArray(kids) ? kids : [kids];
};

describe('ErrorState · подробности под спойлером', () => {
  it('без подробностей рисуется только текст ошибки', () => {
    const el = ErrorState({ message: 'Не удалось загрузить данные. Повторите ещё раз.' });
    const kids = childrenOf(el).filter(Boolean);

    expect(kids).toHaveLength(1);
    expect(kids[0]).toBe('Не удалось загрузить данные. Повторите ещё раз.');
  });

  it('подробности прячутся в <details> с подписью «Подробности»', () => {
    const el = ErrorState({ message: 'Сбой на стороне сервера.', details: 'код: internal_error' });
    const spoiler = childrenOf(el).find(
      (kid) => (kid as { type?: unknown } | null)?.type === 'details'
    ) as { props: { children: unknown[] } } | undefined;

    expect(spoiler, 'спойлер не найден').toBeTruthy();
    const [summary, body] = spoiler!.props.children as Array<{
      type: string;
      props: { children: unknown };
    }>;
    expect(summary.type).toBe('summary');
    expect(summary.props.children).toBe('Подробности');
    expect(body.props.children).toBe('код: internal_error');
  });

  it('основной текст остаётся первым — спойлер не подменяет объяснение', () => {
    const el = ErrorState({ message: 'Запись не найдена.', details: 'код: not_found' });
    expect(childrenOf(el)[0]).toBe('Запись не найдена.');
  });
});
