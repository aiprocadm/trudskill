import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { parseExcelBuffer } from './excel-parser';

function makeXlsxBuffer(aoa: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

function makeCsvBuffer(aoa: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const csv = XLSX.write(wb, { type: 'array', bookType: 'csv' });
  return csv as ArrayBuffer;
}

describe('parseExcelBuffer', () => {
  it('happy: 3 строки с 4 колонками → 3 ParsedRow с правильным rowNumber', () => {
    const buf = makeXlsxBuffer([
      ['ФИО', 'Email', 'СНИЛС', 'Должность'],
      ['Иванов Иван', 'a@x.ru', '111-111-111 45', 'Слесарь'],
      ['Петрова Анна', 'b@x.ru', '', ''],
      ['Сидоров Пётр', 'c@x.ru', '11234567828', 'Инженер']
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      rowNumber: 2,
      fullName: 'Иванов Иван',
      email: 'a@x.ru',
      snils: '111-111-111 45',
      position: 'Слесарь'
    });
    expect(result.rows[1]!.snils).toBeUndefined();
    expect(result.rows[2]!.rowNumber).toBe(4);
  });

  it('заголовки в разном регистре принимаются', () => {
    const buf = makeXlsxBuffer([
      ['фио', 'EMAIL'],
      ['Иванов Иван', 'a@x.ru']
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.fullName).toBe('Иванов Иван');
    expect(result.rows[0]!.email).toBe('a@x.ru');
  });

  it('синоним «Имя» вместо «ФИО» принимается', () => {
    const buf = makeXlsxBuffer([
      ['Имя', 'E-mail'],
      ['Иванов Иван', 'a@x.ru']
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('синоним «Эл. почта» вместо «Email» принимается', () => {
    const buf = makeXlsxBuffer([
      ['ФИО', 'Эл. почта'],
      ['Иванов Иван', 'a@x.ru']
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.email).toBe('a@x.ru');
  });

  it('нет колонки fullName → error missing_required_columns', () => {
    const buf = makeXlsxBuffer([['Только Email'], ['a@x.ru']]);
    const result = parseExcelBuffer(buf);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]!.code).toBe('missing_required_columns');
  });

  it('нет колонки email → error missing_required_columns', () => {
    const buf = makeXlsxBuffer([['ФИО'], ['Иванов Иван']]);
    const result = parseExcelBuffer(buf);
    expect(result.errors[0]!.code).toBe('missing_required_columns');
  });

  it('SNILS как число в Excel-ячейке коэрсится в строку', () => {
    const buf = makeXlsxBuffer([
      ['ФИО', 'Email', 'СНИЛС'],
      ['Иванов Иван', 'a@x.ru', 11234567828]
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.snils).toBe('11234567828');
  });

  it('CSV формат → тот же результат', () => {
    const buf = makeCsvBuffer([
      ['ФИО', 'Email'],
      ['Иванов Иван', 'a@x.ru'],
      ['Петрова Анна', 'b@x.ru']
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
  });

  it('snils/position отсутствуют в файле → ParsedRow без этих полей', () => {
    const buf = makeXlsxBuffer([
      ['ФИО', 'Email'],
      ['Иванов Иван', 'a@x.ru']
    ]);
    const result = parseExcelBuffer(buf);
    expect(result.rows[0]).toEqual({
      rowNumber: 2,
      fullName: 'Иванов Иван',
      email: 'a@x.ru'
    });
  });

  it('пустой файл → error empty_sheet', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const result = parseExcelBuffer(buf);
    expect(result.errors[0]!.code).toBe('empty_sheet');
  });
});

// МГ-C3.1 (срез 10.2): колонки личного дела и ФИО из трёх колонок.
describe('расширенные колонки (МГ-C3.1)', () => {
  it('узнаёт новые заголовки и ФИО из фамилии, имени и отчества; даты Excel — по-русски', () => {
    const buffer = makeXlsxBuffer([
      [
        'Фамилия',
        'Имя слушателя',
        'Отчество',
        'Почта',
        'Пол',
        'Дата рождения',
        'Телефон',
        'ИНН компании',
        'Образование'
      ],
      [
        'Иванов',
        'Иван',
        'Иванович',
        'a@x.ru',
        'м',
        '01.03.1990',
        '+7 900 123-45-67',
        '7701234567',
        'Среднее общее'
      ]
    ]);
    const result = parseExcelBuffer(buffer);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      fullName: '',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
      email: 'a@x.ru',
      gender: 'м',
      dateOfBirth: '01.03.1990',
      phone: '+7 900 123-45-67',
      companyInn: '7701234567',
      educationLevel: 'Среднее общее'
    });
  });

  it('без ФИО и без пары «Фамилия + Имя» — файл отклоняется', () => {
    const result = parseExcelBuffer(
      makeXlsxBuffer([
        ['Фамилия', 'Почта'],
        ['Иванов', 'a@x.ru']
      ])
    );
    expect(result.errors[0]?.code).toBe('missing_required_columns');
  });
});
