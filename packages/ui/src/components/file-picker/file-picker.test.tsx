import { describe, expect, it, vi } from 'vitest';

import { FilePicker, fileRejectionReason, fileRequirementsText } from './index.js';
import { propsOf } from '../../testing/element.test-util.js';

/** Первый узел с нужным классом на любой глубине. */
const find = (node: unknown, className: string): any => {
  if (node === null || typeof node !== 'object') return null;
  const element = node as any;
  if (element.props?.className === className) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, className);
    if (found) return found;
  }
  return null;
};

const file = (name: string, type: string, sizeMb: number) => ({
  name,
  type,
  size: Math.round(sizeMb * 1024 * 1024)
});

describe('требования к файлу — словами и до выбора (ТЗ 5.9)', () => {
  it('форматы перечисляются по-человечески', () => {
    expect(fileRequirementsText('image/png,image/jpeg', 10)).toBe('PNG или JPG, до 10 МБ');
    expect(fileRequirementsText('image/png,image/jpeg,application/pdf')).toBe('PNG, JPG или PDF');
    expect(fileRequirementsText('.xlsx', 5)).toBe('XLSX, до 5 МБ');
    expect(fileRequirementsText(undefined, 25)).toBe('до 25 МБ');
  });

  it('без ограничений требований нет — пустая строка ничего не сообщает', () => {
    expect(fileRequirementsText(undefined, undefined)).toBeUndefined();
  });
});

describe('отказ объясняется человеческим языком (ТЗ 5.9)', () => {
  it('не тот формат — говорим, какой нужен', () => {
    const reason = fileRejectionReason(file('скан.tiff', 'image/tiff', 1), {
      accept: 'image/png,image/jpeg'
    });
    expect(reason).toBe('Такой файл не подойдёт. Нужен PNG или JPG.');
  });

  it('слишком большой — называем и вес файла, и предел', () => {
    // «Файл слишком большой» без чисел не говорит, насколько ужимать.
    const reason = fileRejectionReason(file('селфи.jpg', 'image/jpeg', 12.5), { maxSizeMb: 10 });
    expect(reason).toBe('Файл слишком большой: 12,5 МБ при пределе 10 МБ.');
  });

  it('формат опознаётся и по расширению, и по звёздочке', () => {
    expect(fileRejectionReason(file('акт.xlsx', '', 1), { accept: '.xlsx' })).toBeUndefined();
    expect(
      fileRejectionReason(file('фото.jpg', 'image/jpeg', 1), { accept: 'image/*' })
    ).toBeUndefined();
  });

  it('подходящий файл проходит молча', () => {
    expect(
      fileRejectionReason(file('селфи.jpg', 'image/jpeg', 2), {
        accept: 'image/png,image/jpeg',
        maxSizeMb: 10
      })
    ).toBeUndefined();
  });
});

describe('FilePicker — загрузка файла (ТЗ 5.9)', () => {
  it('без добавок разметка прежняя: восемь экранов не должны поехать', () => {
    const el = FilePicker({ ariaLabel: 'Файл', onSelect: () => {} });
    expect(propsOf(el).className).toBe('ui-file-picker');
  });

  it('перетаскивание работает: файл с рабочего стола доходит до экрана', () => {
    const onSelect = vi.fn();
    const el = FilePicker({ ariaLabel: 'Файл', onSelect, accept: 'image/png' });
    const dropped = new File(['x'], 'схема.png', { type: 'image/png' });
    (propsOf(el) as any).onDrop({
      preventDefault: () => {},
      dataTransfer: { files: [dropped] }
    });
    expect(onSelect).toHaveBeenCalledWith(dropped);
  });

  it('брошенный неподходящий файл НЕ уходит наверх, а объясняется', () => {
    const onSelect = vi.fn();
    const onReject = vi.fn();
    const el = FilePicker({ ariaLabel: 'Файл', onSelect, onReject, accept: 'image/png' });
    (propsOf(el) as any).onDrop({
      preventDefault: () => {},
      dataTransfer: { files: [new File(['x'], 'скан.pdf', { type: 'application/pdf' })] }
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onReject.mock.calls[0]?.[0]).toContain('Нужен PNG');
  });

  it('на телефоне предлагается снять фото, а не искать файл', () => {
    const el = FilePicker({ ariaLabel: 'Селфи', onSelect: () => {}, capture: 'user' });
    const input = find(el, 'ui-file-picker__input');
    expect(input.props.capture).toBe('user');
    expect(find(el, 'ui-button ui-file-picker__button').props.children).toBe(
      'Сделать фото или выбрать'
    );
  });

  it('область перетаскивания зовёт словами и показывает требования', () => {
    const el = FilePicker({
      ariaLabel: 'Селфи',
      onSelect: () => {},
      accept: 'image/png,image/jpeg',
      maxSizeMb: 10,
      variant: 'dropzone'
    });
    expect(find(el, 'ui-file-picker__call').props.children).toBe('Перетащите файл сюда или');
    expect(find(el, 'ui-field-hint').props.children).toBe('PNG или JPG, до 10 МБ');
  });

  it('превью, прогресс и ошибка показываются, когда есть что показать', () => {
    const el = FilePicker({
      ariaLabel: 'Селфи',
      onSelect: () => {},
      previewUrl: 'blob:selfie',
      progress: 40,
      error: 'Не удалось отправить файл'
    });
    expect(find(el, 'ui-file-preview').props.src).toBe('blob:selfie');
    expect(find(el, 'ui-file-preview').props.alt).toBe('Предпросмотр выбранного файла');
    expect(find(el, 'ui-file-progress').props.value).toBe(40);
    const error = find(el, 'ui-field-error');
    expect(error.props.role, 'ошибка обязана дойти до читалки экрана').toBe('alert');
    expect(error.props.children).toBe('Не удалось отправить файл');
  });
});
