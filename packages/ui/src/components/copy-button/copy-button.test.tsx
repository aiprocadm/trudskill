import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyButton, copyText } from './index.js';
import { childrenOf, handlerOf, propsOf, textOf } from '../../testing/element.test-util.js';

/*
 * В пакете нет RTL (RISK-002): компонент вызывается как функция, структура проверяется по
 * свойствам элементов — как у остальных компонентов пакета.
 */

describe('copyText — копирование в буфер обмена', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('пишет значение в буфер и отвечает true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('{%tenant.stamp_image}')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('{%tenant.stamp_image}');
  });

  it('без буфера обмена честно отвечает false, а не падает', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyText('x')).resolves.toBe(false);
  });

  it('отказ браузера — тоже false: вызывающий покажет значение текстом', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    });
    await expect(copyText('x')).resolves.toBe(false);
  });
});

describe('CopyButton', () => {
  it('подпись кнопки постоянная, «Скопировано» — отдельная строка состояния', () => {
    const idle = CopyButton({ value: 'v', label: 'Скопировать тег', onCopy: () => undefined });
    const [button, status] = childrenOf(idle);
    expect(propsOf(button).children).toBe('Скопировать тег');
    expect(status, 'без копирования строки состояния нет').toBeNull();

    const done = CopyButton({
      value: 'v',
      label: 'Скопировать тег',
      copied: true,
      onCopy: () => undefined
    });
    const [buttonAfter, statusAfter] = childrenOf(done);
    expect(propsOf(buttonAfter).children, 'кнопка не переименовывается по ходу (TXT-003)').toBe(
      'Скопировать тег'
    );
    expect(propsOf(statusAfter).role).toBe('status');
    expect(textOf(statusAfter)).toBe('Скопировано');
  });

  it('нажатие копирует значение и сообщает вызывающему результат', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onCopy = vi.fn();
    const el = CopyButton({ value: '{%tenant.signature_image}', label: 'Скопировать тег', onCopy });
    handlerOf(childrenOf(el)[0], 'onClick')();
    await Promise.resolve();
    await Promise.resolve();
    expect(onCopy).toHaveBeenCalledWith(true);
    vi.unstubAllGlobals();
  });

  it('кнопка — вторичная: копирование не первичное действие экрана (UI-007)', () => {
    const el = CopyButton({ value: 'v', label: 'Скопировать', onCopy: () => undefined });
    expect(propsOf(childrenOf(el)[0]).variant).toBe('secondary');
  });
});
