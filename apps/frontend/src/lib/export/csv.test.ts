import { describe, expect, it } from 'vitest';

import { buildCsv, csvCell } from './csv';

/** Выгрузка в CSV (ТЗ 5.5 / Э5). */
describe('buildCsv', () => {
  it('первым идёт BOM, разделитель — точка с запятой: Excel с русской локалью открывает как таблицу', () => {
    const csv = buildCsv(['ФИО', 'Почта'], [['Иванов Иван', 'i@example.ru']]);
    expect(csv.startsWith('﻿'), 'без BOM Excel показывает кракозябры').toBe(true);
    expect(csv).toContain('ФИО;Почта');
    expect(csv).toContain('Иванов Иван;i@example.ru');
  });

  it('строки разделены CRLF — иначе Excel слепляет их в одну', () => {
    expect(buildCsv(['a'], [['1'], ['2']])).toBe('﻿a\r\n1\r\n2');
  });

  it('кавычки, разделитель и перевод строки не ломают колонки', () => {
    expect(csvCell('ООО «Ромб»; филиал')).toBe('"ООО «Ромб»; филиал"');
    expect(csvCell('строка\nвторая')).toBe('"строка\nвторая"');
    expect(csvCell('он сказал "да"')).toBe('"он сказал ""да"""');
    expect(csvCell('обычное')).toBe('обычное');
  });

  it('пусто — это пустая ячейка, а не «undefined» словом', () => {
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });
});
