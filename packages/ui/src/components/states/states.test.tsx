import { describe, expect, it } from 'vitest';

import { EmptyState, ErrorState, LoadingState } from './index.js';

import type { ReactElement } from 'react';

describe('состояния — русские дефолты', () => {
  /*
   * Инвариант изменён осознанно (Фаза 2 редизайна, TXT-005): формулировка «Нет данных»
   * запрещена ТЗ — она сообщает пользователю ровно то, что он и так видит, вместо ответа
   * «что это за раздел и что сделать первым». Сторож стал строже: он проверяет не конкретную
   * строку, а само правило.
   */
  it('EmptyState: дефолт осмысленный, «Нет данных» запрещено', () => {
    const el = EmptyState({});
    const [message] = el.props.children as unknown[];
    expect(message).not.toBe('Нет данных');
    expect(String(message).length).toBeGreaterThan(0);
  });

  it('EmptyState: действие рендерится ссылкой или кнопкой (CMP-014)', () => {
    const withHref = EmptyState({ action: { label: 'Добавить', href: '/learners/new' } });
    const [, , actionWithHref] = withHref.props.children as ReactElement[];
    expect(actionWithHref.props.children.props.href).toBe('/learners/new');

    const withHandler = EmptyState({ action: { label: 'Добавить', onSelect: () => {} } });
    const [, , actionWithHandler] = withHandler.props.children as ReactElement[];
    expect(actionWithHandler.props.children.props.type).toBe('button');
  });

  it('EmptyState без действия не рисует лишних узлов', () => {
    const el = EmptyState({});
    const [, , action] = el.props.children as unknown[];
    expect(action).toBeNull();
  });

  /*
   * Инвариант изменён осознанно (TXT-004): у ошибки появился необязательный спойлер
   * «Подробности», поэтому `children` — это пара «текст + спойлер», а не одна строка.
   * Проверяется по-прежнему главное: первым идёт объяснение для человека.
   */
  it('ErrorState: «Не удалось загрузить данные»', () => {
    const kids = ErrorState({}).props.children as unknown[];
    expect(kids[0]).toBe('Не удалось загрузить данные');
  });

  it('LoadingState: «Загрузка…»', () => {
    expect(LoadingState({}).props.children).toBe('Загрузка…');
  });

  it('переопределение message сохраняется', () => {
    const kids = ErrorState({ message: 'Сбой сети' }).props.children as unknown[];
    expect(kids[0]).toBe('Сбой сети');
  });
});
