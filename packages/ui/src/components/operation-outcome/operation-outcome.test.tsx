import { describe, expect, it } from 'vitest';

import { OperationOutcome } from './index.js';

import type { ReactElement } from 'react';

describe('итог операции (CMP-011)', () => {
  it('сводка называет сделанное и общее число', () => {
    const element = OperationOutcome({
      outcome: { total: 15, succeeded: 12, failures: [] }
    }) as ReactElement;
    const [summary] = element.props.children as ReactElement[];
    expect(summary.props.children.join('')).toBe('Готово: 12 из 15');
  });

  it('глагол сводки задаётся операцией — «зачислено», а не всегда «готово»', () => {
    const element = OperationOutcome({
      outcome: { total: 3, succeeded: 3, failures: [] },
      successVerb: 'Зачислено'
    }) as ReactElement;
    const [summary] = element.props.children as ReactElement[];
    expect(summary.props.children.join('')).toContain('Зачислено: 3 из 3');
  });

  it('отказы показаны ПОИМЁННО с причиной', () => {
    // Сводка «12 из 15» без имён не отвечает на вопрос, что случилось с остальными.
    const element = OperationOutcome({
      outcome: {
        total: 2,
        succeeded: 1,
        failures: [{ label: 'Иванов Иван Иванович', reason: 'СНИЛС не проходит проверку' }]
      }
    }) as ReactElement;
    const rendered = JSON.stringify(element);
    expect(rendered).toContain('Иванов Иван Иванович');
    expect(rendered).toContain('СНИЛС не проходит проверку');
  });

  it('без отказов список не рисуется', () => {
    const element = OperationOutcome({
      outcome: { total: 4, succeeded: 4, failures: [] }
    }) as ReactElement;
    const [, failures] = element.props.children as ReactElement[];
    expect(failures).toBeNull();
  });

  it('итог объявлен как статус — программа чтения с экрана его озвучит', () => {
    const element = OperationOutcome({
      outcome: { total: 1, succeeded: 0, failures: [{ label: 'Пётр', reason: 'нет почты' }] }
    }) as ReactElement;
    expect(element.props.role).toBe('status');
  });
});
