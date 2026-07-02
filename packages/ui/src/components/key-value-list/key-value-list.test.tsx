import { describe, expect, it } from 'vitest';

import { KeyValueList } from './index.js';

import type { ReactElement } from 'react';

describe('KeyValueList — канонический key/value список (dl.kv-list)', () => {
  it('рендерит dl.kv-list со строками dt/dd', () => {
    const el = KeyValueList({
      items: [
        { label: 'ИНН', value: '7701234567' },
        { label: 'Статус', value: 'Активен' }
      ]
    });
    expect(el.type).toBe('dl');
    expect(el.props.className).toBe('kv-list');
    const rows = el.props.children as ReactElement[];
    expect(rows).toHaveLength(2);
    const [dt, dd] = rows[0]?.props.children as ReactElement[];
    expect(rows[0]?.props.className).toBe('kv-list__row');
    expect(dt.type).toBe('dt');
    expect(dt.props.children).toBe('ИНН');
    expect(dd.type).toBe('dd');
    expect(dd.props.children).toBe('7701234567');
  });

  it('дубли label не конфликтуют по key', () => {
    const el = KeyValueList({
      items: [
        { label: 'Телефон', value: '+7 900' },
        { label: 'Телефон', value: '+7 901' }
      ]
    });
    const rows = el.props.children as ReactElement[];
    expect(rows[0]?.key).toBe('Телефон-0');
    expect(rows[1]?.key).toBe('Телефон-1');
  });
});
