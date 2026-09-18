import { describe, expect, it } from 'vitest';

import { BlockedHint, blockedHintId, blockedProps } from './index.js';
import { propsOf } from '../../testing/element.test-util.js';

describe('заблокированная кнопка объясняет себя (ТЗ 5.8)', () => {
  it('с причиной кнопка выключается И говорит, чего не хватает', () => {
    const props = blockedProps('idv', 'Загрузите селфи и фото паспорта');
    expect(props.disabled).toBe(true);
    // Всплывающая подсказка — для мыши…
    expect(props.title).toBe('Загрузите селфи и фото паспорта');
    // …а связь с видимой строкой — для клавиатуры, телефона и читалки экрана.
    expect(props['aria-describedby']).toBe(blockedHintId('idv'));
  });

  it('без причины свойств нет вовсе — кнопка живёт своей жизнью', () => {
    /*
     * Занятость («идёт сохранение») выключает кнопку отдельно и объяснений не требует:
     * человек сам только что нажал, и об этом говорит крутилка.
     */
    expect(blockedProps('idv', undefined)).toEqual({});
  });

  it('видимая строка связана с кнопкой тем же идентификатором', () => {
    const hint = BlockedHint({ hintKey: 'idv', reason: 'Загрузите селфи' });
    expect(propsOf(hint!).id).toBe(blockedHintId('idv'));
    expect(propsOf(hint!).role).toBe('note');
    expect(propsOf(hint!).children).toBe('Загрузите селфи');
  });

  it('без причины строка не рисуется — иначе раскладка прыгала бы', () => {
    expect(BlockedHint({ hintKey: 'idv', reason: undefined })).toBeNull();
  });
});
