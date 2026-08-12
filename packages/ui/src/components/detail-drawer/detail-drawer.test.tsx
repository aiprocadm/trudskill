import { describe, expect, it, vi } from 'vitest';

import { DetailDrawer } from './index.js';

import type * as ReactModule from 'react';

vi.mock('react', async () => {
  const actual = await vi.importActual<ReactModule>('react');
  // Компонент вызывается как функция (в пакете нет RTL), поэтому хуки состояния и эффектов
  // подменяются на предсказуемые заглушки: проверяется разметка и ветвление, не реакт.
  return {
    ...actual,
    useId: () => 'test',
    useRef: () => ({ current: null }),
    useState: (initial: unknown) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn: unknown) => fn
  };
});

const noop = () => {};

describe('панель деталей (CMP-010)', () => {
  it('закрытая панель ничего не рендерит', () => {
    expect(DetailDrawer({ open: false, onClose: noop, title: 'Слушатель' })).toBeNull();
  });

  it('ширина задаётся классом из трёх допустимых', () => {
    const drawer = DetailDrawer({ open: true, onClose: noop, title: 'Слушатель', width: 'lg' });
    const panel = (drawer?.props.children as unknown[])[1] as { props: { className: string } };
    expect(panel.props.className).toContain('ui-drawer--lg');
  });

  it('во время загрузки тело показывает индикатор, а не содержимое', () => {
    const drawer = DetailDrawer({
      open: true,
      onClose: noop,
      title: 'Слушатель',
      isLoading: true,
      children: 'СОДЕРЖИМОЕ'
    });
    expect(JSON.stringify(drawer)).not.toContain('СОДЕРЖИМОЕ');
  });

  it('ошибка показывается с кнопкой повтора, а не молча', () => {
    const drawer = DetailDrawer({
      open: true,
      onClose: noop,
      title: 'Слушатель',
      error: new Error('сбой'),
      onRetry: noop,
      children: 'СОДЕРЖИМОЕ'
    });
    const rendered = JSON.stringify(drawer);
    expect(rendered).toContain('Повторить');
    expect(rendered).not.toContain('СОДЕРЖИМОЕ');
  });

  it('подзаголовок необязателен', () => {
    const withSubtitle = JSON.stringify(
      DetailDrawer({ open: true, onClose: noop, title: 'Слушатель', subtitle: 'Иванов' })
    );
    expect(withSubtitle).toContain('Иванов');
  });

  it('футер отводится под действия панели', () => {
    const drawer = JSON.stringify(
      DetailDrawer({ open: true, onClose: noop, title: 'Слушатель', footer: 'СОХРАНИТЬ' })
    );
    expect(drawer).toContain('СОХРАНИТЬ');
  });
});
