import { describe, expect, it } from 'vitest';

import { EmptyState, ErrorState, LoadingState } from './index.js';

describe('состояния — русские дефолты', () => {
  it('EmptyState: «Нет данных»', () => {
    const el = EmptyState({});
    const [message] = el.props.children as unknown[];
    expect(message).toBe('Нет данных');
  });

  it('ErrorState: «Не удалось загрузить данные»', () => {
    expect(ErrorState({}).props.children).toBe('Не удалось загрузить данные');
  });

  it('LoadingState: «Загрузка…»', () => {
    expect(LoadingState({}).props.children).toBe('Загрузка…');
  });

  it('переопределение message сохраняется', () => {
    expect(ErrorState({ message: 'Сбой сети' }).props.children).toBe('Сбой сети');
  });
});
