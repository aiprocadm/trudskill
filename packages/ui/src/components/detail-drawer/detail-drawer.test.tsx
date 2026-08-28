import { describe, expect, it, vi } from 'vitest';

import { DetailDrawer, DrawerCancelButton } from './index.js';
import { propsOf } from '../../testing/element.test-util.js';

import type * as ReactModule from 'react';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof ReactModule>('react');
  // Компонент вызывается как функция (в пакете нет RTL), поэтому хуки состояния и эффектов
  // подменяются на предсказуемые заглушки: проверяется разметка и ветвление, не реакт.
  return {
    ...actual,
    useId: () => 'test',
    useRef: () => ({ current: null }),
    useState: (initial: unknown) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn: unknown) => fn,
    // Порция 34: вне панели контекст пуст — ровно тот случай, который проверяется ниже
    // («кнопку используют не внутри панели → закрываем напрямую»).
    useContext: () => null
  };
});

const noop = () => {};

/*
 * Ревизия 2026-08-27 (порция 34): дерево панели сериализуется СВОИМ обходом, а не
 * `JSON.stringify`. Содержимое теперь оборачивается в провайдер контекста (через него
 * кнопка «Отмена» получает «закрытие с проверкой»), а у провайдера ссылка на самого
 * себя — обычная сериализация на нём падает «circular structure». Обход берёт только то,
 * что тестам и нужно: подписи и текст.
 */
const plainText = (node: unknown, depth = 0): string => {
  if (node === null || node === undefined || depth > 20) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((item) => plainText(item, depth + 1)).join(' ');
  if (typeof node === 'object') {
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return '';
    return Object.entries(props)
      .filter(([key]) => key !== 'ref' && key !== 'key')
      .map(([, value]) => plainText(value, depth + 1))
      .join(' ');
  }
  return '';
};

describe('панель деталей (CMP-010)', () => {
  it('закрытая панель ничего не рендерит', () => {
    expect(DetailDrawer({ open: false, onClose: noop, title: 'Слушатель' })).toBeNull();
  });

  it('ширина задаётся классом из трёх допустимых', () => {
    const drawer = DetailDrawer({ open: true, onClose: noop, title: 'Слушатель', width: 'lg' });
    const panel = (propsOf(drawer).children as unknown[])[1] as { props: { className: string } };
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
    expect(plainText(drawer)).not.toContain('СОДЕРЖИМОЕ');
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
    const rendered = plainText(drawer);
    expect(rendered).toContain('Повторить');
    expect(rendered).not.toContain('СОДЕРЖИМОЕ');
  });

  it('подзаголовок необязателен', () => {
    const withSubtitle = plainText(
      DetailDrawer({ open: true, onClose: noop, title: 'Слушатель', subtitle: 'Иванов' })
    );
    expect(withSubtitle).toContain('Иванов');
  });

  it('футер отводится под действия панели', () => {
    const drawer = plainText(
      DetailDrawer({ open: true, onClose: noop, title: 'Слушатель', footer: 'СОХРАНИТЬ' })
    );
    expect(drawer).toContain('СОХРАНИТЬ');
  });
});

/*
 * Ревизия 2026-08-27 (порция 34, журнал 288): кнопка «Отмена» внутри формы закрывала
 * панель НАПРЯМУЮ, минуя подтверждение, — заполненная форма исчезала молча. Esc и клик
 * мимо панели спрашивали, а кнопка нет; для человека это одно и то же действие.
 */
describe('кнопка отказа от правок закрывает как Esc (порция 34)', () => {
  it('вне панели закрывает напрямую: подтверждать нечем', () => {
    let closed = 0;
    const button = DrawerCancelButton({ onFallbackClose: () => (closed += 1) });
    (button.props as { onClick: () => void }).onClick();
    expect(closed).toBe(1);
  });

  it('название по умолчанию — «Отмена», но его можно заменить', () => {
    expect(plainText(DrawerCancelButton({}))).toContain('Отмена');
    expect(plainText(DrawerCancelButton({ children: 'Не сохранять' }))).toContain('Не сохранять');
  });

  it('во время сохранения кнопка недоступна', () => {
    const button = DrawerCancelButton({ disabled: true });
    expect((button.props as { disabled?: boolean }).disabled).toBe(true);
  });
});
